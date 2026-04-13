import {
    assertCleanWorkspace,
    capture,
    formatVersion,
    parseVersion,
    readPackageJson,
    readReleaseConfig,
    run,
    runEntrypoint,
    Version,
    writeVersion,
} from "./util.js"

import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { regenerateCurrentVersionChangelog } from "./changelog.js"

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const { refPrefix: TAG_PREFIX, branchSuffix: RELEASE_BRANCH_SUFFIX } = readReleaseConfig()
const RELEASE_BRANCH_RE = new RegExp(
    `^${escapeRegExp(TAG_PREFIX)}(\\d+)\.(\\d+)${escapeRegExp(RELEASE_BRANCH_SUFFIX)}$`,
)
const TAG_RE = new RegExp(
    `^${escapeRegExp(TAG_PREFIX)}(\\d+)\\.(\\d+)\\.(\\d+)(?:-[\\w.-]+)?$`,
)

type BumpChoice = "major" | "minor"

interface BumpDecision {
    choice: BumpChoice
    reason: string
}

interface VersionTriple {
    major: number
    minor: number
    patch: number
}

const git = (...args: string[]): string => capture("git", args)

function compareTriples(a: VersionTriple, b: VersionTriple): number {
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    return a.patch - b.patch
}

/**
 * Walks local branches matching `RELEASE_BRANCH_RE` and tags matching
 * `TAG_RE`, returning the highest-versioned reference. Branches contribute
 * `(major, minor)` only — patch is treated as `-1` so a tag at the same
 * `(major, minor)` ranks higher when both exist.
 */
function findLatestReleaseRef(): { triple: VersionTriple; ref: string } | null {
    const branches = git(
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads/",
    ).split("\n").filter(Boolean)

    const tags = git("tag", "-l").split("\n").filter(Boolean)

    let latest: { triple: VersionTriple; ref: string } | null = null

    const consider = (triple: VersionTriple, ref: string): void => {
        if (latest === null || compareTriples(triple, latest.triple) > 0) {
            latest = { triple, ref }
        }
    }

    for (const branch of branches) {
        const m = RELEASE_BRANCH_RE.exec(branch)
        if (m) consider({ major: +m[1], minor: +m[2], patch: -1 }, branch)
    }

    for (const tag of tags) {
        const m = TAG_RE.exec(tag)
        if (m) consider({ major: +m[1], minor: +m[2], patch: +m[3] }, tag)
    }

    return latest
}

function detectBumpFromVersionState(current: Version): BumpDecision {
    const latest = findLatestReleaseRef()

    if (latest === null) {
        return { choice: "minor", reason: "no prior release branches or tags found" }
    }

    const currentTriple: VersionTriple = {
        major: current.major,
        minor: current.minor,
        patch: current.patch,
    }

    if (compareTriples(currentTriple, latest.triple) <= 0) {
        throw new Error(
            `package.json version ${
                formatVersion(current)
            } is not ahead of latest release ${latest.ref}. Bump package.json before releasing.`,
        )
    }

    if (current.major > latest.triple.major) {
        return {
            choice: "major",
            reason: `package.json ${formatVersion(current)} advances major from ${latest.ref}`,
        }
    }

    return {
        choice: "minor",
        reason: `package.json ${
            formatVersion(current)
        } stays on major ${current.major} (latest release: ${latest.ref})`,
    }
}

async function confirm(question: string): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase()
    rl.close()
    return answer === "y" || answer === "yes"
}

interface ReleaseOptions {
    skipConfirm: boolean
    ref?: string
}

function printHelp(): void {
    console.log(
        `Usage: tsx scripts/release.ts [options]

Cuts a release: bumps version, regenerates CHANGELOG.md, commits, and tags.

By default operates on the current HEAD. Pass --ref to check out a specific
commit, branch, or tag first.

The release commit and tag are always created. Follow-up "next-dev" commits
are only created when running at the tip of a branch ('main' or a release
branch). On detached HEAD, only the release commit and tag are created.

Options:
  -h, --help         Show this help and exit
  -y, --yes          Skip the interactive confirmation prompt
      --ref <ref>    Check out <ref> before releasing (commit, branch, or tag)
`,
    )
}

function parseCliArgs(argv: string[]): ReleaseOptions | null {
    const { values } = parseArgs({
        args: argv,
        options: {
            help: { type: "boolean", short: "h" },
            yes: { type: "boolean", short: "y" },
            ref: { type: "string" },
        },
        strict: true,
    })

    if (values.help) {
        printHelp()
        return null
    }

    return { skipConfirm: values.yes ?? false, ref: values.ref }
}

function currentBranch(): string | null {
    try {
        return capture("git", ["symbolic-ref", "--short", "HEAD"])
    }
    catch {
        return null
    }
}

function commitVersion(message: string): void {
    git("add", "package.json", "CHANGELOG.md")
    git("commit", "-m", message)
}

function createTag(tag: string): void {
    git("tag", tag)
}

async function regenerateChangelog(): Promise<void> {
    await regenerateCurrentVersionChangelog()
    git("add", "CHANGELOG.md")
}

async function main(): Promise<void> {
    const options = parseCliArgs(process.argv.slice(2))

    if (options === null) {
        return
    }

    await runRelease(options)
}

async function runRelease(options: ReleaseOptions): Promise<void> {
    assertCleanWorkspace()

    if (options.ref !== undefined) {
        git("checkout", options.ref)
    }

    const branch = currentBranch()
    const current = parseVersion(readPackageJson().version)

    if (current.prerelease !== "dev") {
        throw new Error(
            `Current version "${formatVersion(current)}" has no -dev suffix; nothing to release.`,
        )
    }

    const releaseVersion: Version = { ...current, prerelease: null }
    const releaseStr = formatVersion(releaseVersion)
    const tag = `${TAG_PREFIX}${releaseStr}`

    let onReleaseBranch = false
    let releaseBranchName: string | null = null
    let releaseBranchNextDev: Version | null = null
    let fromBranchNextDev: Version | null = null

    if (branch !== null) {
        if (RELEASE_BRANCH_RE.test(branch)) {
            onReleaseBranch = true
            releaseBranchName = branch
            releaseBranchNextDev = {
                ...current,
                patch: current.patch + 1,
                prerelease: "dev",
            }
        }
        else if (branch === "main") {
            const decision = detectBumpFromVersionState(current)
            console.log(`Detected bump: ${decision.choice} (${decision.reason})`)

            fromBranchNextDev = {
                major: current.major,
                minor: current.minor + 1,
                patch: 0,
                prerelease: "dev",
            }
            releaseBranchName = `${TAG_PREFIX}${releaseVersion.major}.${releaseVersion.minor}${RELEASE_BRANCH_SUFFIX}`
            releaseBranchNextDev = {
                major: releaseVersion.major,
                minor: releaseVersion.minor,
                patch: releaseVersion.patch + 1,
                prerelease: "dev",
            }
        }
        else {
            throw new Error(
                `At tip of '${branch}'; expected 'main' or a release branch. Detach HEAD (or pass --ref) to release from this commit without next-dev bumps.`,
            )
        }
    }

    const releaseBranchNextDevStr = releaseBranchNextDev ? formatVersion(releaseBranchNextDev) : null
    const fromBranchNextDevStr = fromBranchNextDev ? formatVersion(fromBranchNextDev) : null

    console.log()

    if (branch !== null) {
        console.log(`Release version        : ${releaseStr}  (on ${releaseBranchName})`)
        console.log(`Release branch next dev: ${releaseBranchNextDevStr}  (on ${releaseBranchName})`)

        if (fromBranchNextDevStr) {
            console.log(`Main next dev          : ${fromBranchNextDevStr}  (on ${branch})`)
        }
    }
    else {
        const head = capture("git", ["rev-parse", "--short", "HEAD"])
        console.log(`Release version: ${releaseStr}  (detached HEAD at ${head})`)
        console.log("Skipping next-dev bump — not at the tip of a branch.")
    }

    console.log(`Tag to create  : ${tag}\n`)

    if (!options.skipConfirm && !(await confirm("Proceed?"))) {
        console.log("Aborted.")
        process.exit(1)
    }

    if (branch !== null && !onReleaseBranch) {
        git("branch", releaseBranchName!)
        git("checkout", releaseBranchName!)
    }

    writeVersion(releaseStr)
    await regenerateChangelog()
    commitVersion(`chore: release ${releaseStr}`)
    createTag(tag)

    run("pnpm", ["package"])

    if (branch === null) {
        const head = capture("git", ["rev-parse", "--short", "HEAD"])
        console.log("\nDone.")
        console.log(`  Release commit ${head} and tag ${tag} created on detached HEAD.`)
        console.log(`  Push the tag with: git push origin ${tag}`)
        console.log(`  The commit is not on a branch — cherry-pick or merge it where needed.`)
        return
    }

    writeVersion(releaseBranchNextDevStr!)
    commitVersion(`chore: start ${releaseBranchNextDevStr} development`)

    if (fromBranchNextDevStr) {
        git("checkout", branch)
        git("checkout", releaseBranchName!, "--", "CHANGELOG.md")
        writeVersion(fromBranchNextDevStr)
        commitVersion(`chore: start ${fromBranchNextDevStr} development`)
    }

    console.log("\nDone. Next steps:")
    console.log(`  git push origin ${releaseBranchName} ${tag}`)

    if (fromBranchNextDevStr) {
        console.log(`  git push origin ${branch}`)
    }
}

runEntrypoint(import.meta.url, main)
