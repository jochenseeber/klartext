import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"

import {
    assertCleanWorkspace,
    capture,
    formatVersion,
    parseVersion,
    readPackageJson,
    readReleaseConfig,
    ROOT,
    runEntrypoint,
    Version,
    writeVersion,
} from "./util.js"

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

const PLAN_PATH = resolve(ROOT, ".tmp/release-plan.json")

type Phase = "plan" | "bump" | "commit" | "dev" | "propagate"
const PHASES: readonly Phase[] = ["plan", "bump", "commit", "dev", "propagate"]

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

interface ReleasePlan {
    currentVersion: string
    releaseVersion: string
    tag: string
    branch: string | null
    onReleaseBranch: boolean
    releaseBranchName: string | null
    releaseBranchNextDev: string | null
    fromBranchNextDev: string | null
}

interface PlanOptions {
    ref?: string
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

function writePlan(plan: ReleasePlan): void {
    mkdirSync(dirname(PLAN_PATH), { recursive: true })
    writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 4)}\n`)
}

function readPlan(): ReleasePlan {
    if (!existsSync(PLAN_PATH)) {
        throw new Error(`Release plan not found at ${PLAN_PATH}. Run 'release plan' first.`)
    }

    return JSON.parse(readFileSync(PLAN_PATH, "utf8")) as ReleasePlan
}

function clearPlan(): void {
    rmSync(PLAN_PATH, { force: true })
}

async function runPlan(options: PlanOptions): Promise<void> {
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

    if (branch !== null && !onReleaseBranch) {
        git("branch", releaseBranchName!)
        git("checkout", releaseBranchName!)
    }

    writePlan({
        currentVersion: formatVersion(current),
        releaseVersion: releaseStr,
        tag,
        branch,
        onReleaseBranch,
        releaseBranchName,
        releaseBranchNextDev: releaseBranchNextDevStr,
        fromBranchNextDev: fromBranchNextDevStr,
    })

    console.log(`Plan written to ${PLAN_PATH}`)
}

function runBump(): void {
    const plan = readPlan()
    writeVersion(plan.releaseVersion)
}

function runCommit(): void {
    const plan = readPlan()
    commitVersion(`chore: release ${plan.releaseVersion}`)
    createTag(plan.tag)
}

function runDev(): void {
    const plan = readPlan()

    if (plan.branch === null || plan.releaseBranchNextDev === null) {
        const head = capture("git", ["rev-parse", "--short", "HEAD"])
        console.log()
        console.log(`Release commit ${head} and tag ${plan.tag} created on detached HEAD.`)
        console.log(`Push the tag with: git push origin ${plan.tag}`)
        console.log("The commit is not on a branch — cherry-pick or merge it where needed.")
        return
    }

    writeVersion(plan.releaseBranchNextDev)
    commitVersion(`chore: start ${plan.releaseBranchNextDev} development`)
}

function runPropagate(): void {
    const plan = readPlan()

    if (plan.branch === null) {
        clearPlan()
        return
    }

    if (plan.fromBranchNextDev) {
        git("checkout", plan.branch)
        git("checkout", plan.tag, "--", "CHANGELOG.md")
        writeVersion(plan.fromBranchNextDev)
        commitVersion(`chore: start ${plan.fromBranchNextDev} development`)
    }

    console.log("\nDone. Next steps:")
    console.log(`  git push origin ${plan.releaseBranchName} ${plan.tag}`)

    if (plan.fromBranchNextDev) {
        console.log(`  git push origin ${plan.branch}`)
    }

    clearPlan()
}

function printHelp(): void {
    console.log(
        `Usage: tsx scripts/release.ts <phase> [options]

Phases (run in order, typically orchestrated via nx):
  plan        Validate workspace, decide versions, prompt for confirmation,
              create the release branch (if on main), and write the plan to
              .tmp/release-plan.json.
  bump        Write the release version to package.json (no commit yet).
  commit      Stage package.json + CHANGELOG.md, create the release commit,
              and tag it. (Runs after the changelog task regenerates
              CHANGELOG.md.)
  dev         Bump the release branch to its next-dev version and commit.
  propagate   If released from main, switch to main, copy the CHANGELOG.md
              from the release branch, bump main to its next-dev version,
              and commit. Always clears the plan file when done.

Options (only meaningful for 'plan'):
  -h, --help         Show this help and exit
      --ref <ref>    Check out <ref> before planning the release
`,
    )
}

function isPhase(value: string): value is Phase {
    return (PHASES as readonly string[]).includes(value)
}

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            help: { type: "boolean", short: "h" },
            ref: { type: "string" },
        },
        allowPositionals: true,
        strict: true,
    })

    if (values.help) {
        printHelp()
        return
    }

    if (positionals.length !== 1) {
        printHelp()
        throw new Error(`Expected exactly one phase argument; got ${positionals.length}`)
    }

    const phase = positionals[0]

    if (!isPhase(phase)) {
        throw new Error(`Unknown phase '${phase}'. Expected one of: ${PHASES.join(", ")}`)
    }

    switch (phase) {
        case "plan":
            await runPlan({ ref: values.ref })
            break
        case "bump":
            runBump()
            break
        case "commit":
            runCommit()
            break
        case "dev":
            runDev()
            break
        case "propagate":
            runPropagate()
            break
    }
}

runEntrypoint(import.meta.url, main)
