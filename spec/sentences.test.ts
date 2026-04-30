import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { applyReplacementRules } from "../src/content"

interface Entry {
    index: number
    heading: string
    original: string
    expected: string
}

const SWEAR = "🤬"
const ARROW = "➡️"
const HEADING = "# Sentences"
const WRAP_WIDTH = 79
const BLANK = /\n[ \t]*\n/

const here = fileURLToPath(new URL(".", import.meta.url))
const INPUT_PATH = resolve(here, "sentences.md")
const OUTPUT_PATH = resolve(here, "..", ".tmp", "sentences.md")

// A "sentence" (content unit) starts immediately after an emoji marker and
// ends at the nearest of: next emoji marker, blank line, EOF.
function contentEnd(text: string, from: number): number {
    const blank = BLANK.exec(text.slice(from))
    const blankAt = blank === null ? Infinity : from + blank.index
    const swearAt = text.indexOf(SWEAR, from)
    const arrowAt = text.indexOf(ARROW, from)
    const candidates = [blankAt, text.length]

    if (swearAt !== -1) {
        candidates.push(swearAt)
    }

    if (arrowAt !== -1) {
        candidates.push(arrowAt)
    }

    return Math.min(...candidates)
}

function loadEntries(): Entry[] {
    if (!existsSync(INPUT_PATH)) {
        return []
    }

    const text = readFileSync(INPUT_PATH, "utf8")

    // Build sorted list of (position, heading) pairs for fast lookup.
    const headingPositions: Array<[number, string]> = []
    const headingRe = /^## .+$/gmu
    let hm: RegExpExecArray | null

    while ((hm = headingRe.exec(text)) !== null) {
        headingPositions.push([hm.index, hm[0]])
    }

    function headingBefore(pos: number): string {
        let result = ""

        for (const [hPos, h] of headingPositions) {
            if (hPos <= pos) {
                result = h
            }
            else {
                break
            }
        }

        return result
    }

    const entries: Entry[] = []
    let pos = 0

    while (true) {
        const swearAt = text.indexOf(SWEAR, pos)

        if (swearAt === -1) {
            break
        }

        const swearStart = swearAt + SWEAR.length
        const swearEnd = contentEnd(text, swearStart)
        const original = text.slice(swearStart, swearEnd).replace(/\s+/g, " ").trim()

        const arrowAt = text.indexOf(ARROW, swearEnd)

        if (arrowAt === -1) {
            throw new Error(`🤬 at offset ${swearAt} has no following ➡️`)
        }

        const arrowStart = arrowAt + ARROW.length
        const arrowEnd = contentEnd(text, arrowStart)
        const expected = text.slice(arrowStart, arrowEnd).replace(/\s+/g, " ").trim()

        entries.push({ index: entries.length + 1, heading: headingBefore(swearAt), original, expected })

        pos = arrowEnd
    }

    return entries
}

function wrap(text: string, width: number): string {
    const words = text.split(" ")
    const lines: string[] = []
    let current = ""

    for (const word of words) {
        const next = current ? `${current} ${word}` : word

        if (next.length > width && current) {
            lines.push(current)
            current = word
        }
        else {
            current = next
        }
    }

    if (current) {
        lines.push(current)
    }

    return lines.join("\n")
}

function writeOutput(results: ReadonlyArray<{ heading: string; original: string; actual: string }>): void {
    const parts: string[] = [HEADING, ""]
    let lastHeading = ""

    for (const r of results) {
        if (r.heading !== lastHeading) {
            parts.push(r.heading)
            parts.push("")
            lastHeading = r.heading
        }

        parts.push(wrap(`${SWEAR} ${r.original}`, WRAP_WIDTH))
        parts.push("")
        parts.push(wrap(`${ARROW} ${r.actual}`, WRAP_WIDTH))
        parts.push("")
    }

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, parts.join("\n"))
}

function resolveDiffCommand(): string | null {
    const value = process.env.KLARTEXT_DIFF_CMD

    if (value === undefined || value === "") {
        return null
    }

    return value === "1" || value === "true" ? "code" : value
}

function openDiff(cmd: string): void {
    spawn(cmd, ["--diff", INPUT_PATH, OUTPUT_PATH], {
        stdio: "ignore",
        detached: true,
    }).unref()
}

describe("sentences corpus", () => {
    const entries = loadEntries()

    it("loads at least one entry", () => {
        expect(entries.length).toBeGreaterThan(0)
    })

    it("applies the rule cascade and writes output for diffing", () => {
        const results = entries.map((entry) => ({
            index: entry.index,
            heading: entry.heading,
            original: entry.original,
            expected: entry.expected,
            actual: applyReplacementRules(entry.original),
        }))

        const matches = results.filter((r) => r.actual === r.expected)
        const mismatches = results.length - matches.length
        const ratio = matches.length / results.length
        const matchPct = (ratio * 100).toFixed(1)

        // Write the rule-derived output to .tmp/sentences.md in the same shape
        // as the input so it can be diffed against spec/sentences.md.
        writeOutput(results)

        // KLARTEXT_DIFF_CMD opens a diff window against the input. The value
        // is the diff binary to invoke ("1" or "true" alias to "code"). Unset
        // disables the diff.
        const diffCmd = resolveDiffCommand()

        if (diffCmd !== null) {
            openDiff(diffCmd)
        }

        console.log()
        console.log(`sentences corpus: ${results.length} entries`)
        console.log(`  matches:    ${matches.length} (${matchPct}%)`)
        console.log(`  mismatches: ${mismatches}`)
        console.log(`  output:     ${OUTPUT_PATH}`)
        console.log(`  diff:       diff -u ${INPUT_PATH} ${OUTPUT_PATH}`)
        console.log(`  open diff:  KLARTEXT_DIFF_CMD=1 pnpm vitest run spec/sentences.test.ts`)

        expect(ratio).toBeGreaterThan(0.9)
    })
})
