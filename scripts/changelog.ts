import { readPackageJson, readReleaseConfig, ROOT, runEntrypoint, writeFormattedTextFile } from "./util.js"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const CHANGELOG_PATH = resolve(ROOT, "CHANGELOG.md")
const TITLE = "# Changelog"

const TAG_PREFIX = readReleaseConfig().refPrefix

function readExistingBody(): string {
    try {
        return readFileSync(CHANGELOG_PATH, "utf8")
    }
    catch {
        return ""
    }
}

function stripLeadingTitle(body: string): string {
    const lines = body.split("\n")
    let i = 0

    if (lines[i]?.trim() === TITLE) {
        i += 1
        while (i < lines.length && lines[i].trim() === "") i += 1
    }

    return lines.slice(i).join("\n")
}

function hasVersionSection(body: string, version: string): boolean {
    const escaped = version.replace(/[.\-+]/g, "\\$&")
    return new RegExp(`^##\\s+\\[?${escaped}[\\]\\s(]`, "m").test(body)
}

async function generateEntries(): Promise<string> {
    const { ConventionalChangelog } = await import("conventional-changelog")
    const generator = new ConventionalChangelog(ROOT)
        .loadPreset("conventionalcommits")
        .readPackage()
        .tags({ prefix: TAG_PREFIX })
        .options({ outputUnreleased: true, releaseCount: 1 })

    let out = ""

    for await (const chunk of generator.write()) {
        out += chunk
    }

    return out.trim()
}

function writeChangelog(body: string, dryRun: boolean): void {
    const trimmed = body.trim()
    const content = trimmed ? `${TITLE}\n\n${trimmed}\n` : `${TITLE}\n`

    if (dryRun) {
        process.stdout.write(content)
        return
    }

    writeFormattedTextFile(CHANGELOG_PATH, content)
}

export interface RegenerateChangelogOptions {
    dryRun?: boolean
}

export async function regenerateCurrentVersionChangelog(
    options: RegenerateChangelogOptions = {},
): Promise<void> {
    const dryRun = options.dryRun ?? false
    const version = readPackageJson().version
    const body = stripLeadingTitle(readExistingBody())

    if (hasVersionSection(body, version)) {
        writeChangelog(body, dryRun)
        return
    }

    const entries = await generateEntries()
    const combined = entries ? body ? `${entries}\n\n${body}` : entries : body
    writeChangelog(combined, dryRun)
}

function printHelp(): void {
    console.log(
        `Usage: tsx scripts/changelog.ts [options]

Regenerates CHANGELOG.md from conventional commits since the last release tag.
Adds a section for the current package.json version if one is not present.
Idempotent — re-running with no new commits produces the same file.

Options:
  -h, --help     Show this help and exit
  -n, --dry-run  Print the rendered changelog to stdout without writing the file
`,
    )
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            help: { type: "boolean", short: "h" },
            "dry-run": { type: "boolean", short: "n" },
        },
        strict: true,
    })

    if (values.help) {
        printHelp()
        return
    }

    await regenerateCurrentVersionChangelog({ dryRun: values["dry-run"] ?? false })
}

runEntrypoint(import.meta.url, main)
