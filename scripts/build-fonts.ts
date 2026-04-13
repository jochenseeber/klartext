import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import subsetFont from "subset-font"

import { ROOT, runEntrypoint } from "./util.js"

interface FontEntry {
    family: string
    weight: number
    file: string
}

const FONTS: readonly FontEntry[] = [
    { family: "fraunces", weight: 500, file: "fraunces-500.ttf" },
    { family: "fraunces", weight: 700, file: "fraunces-700.ttf" },
    { family: "manrope", weight: 400, file: "manrope-400.ttf" },
    { family: "manrope", weight: 500, file: "manrope-500.ttf" },
    { family: "manrope", weight: 700, file: "manrope-700.ttf" },
]

const SOURCE_DIR = resolve(ROOT, "artwork/fonts")
const OUTPUT_DIR = resolve(ROOT, "docs/fonts")

function buildSubsetText(): string {
    const ranges: Array<[number, number]> = [
        [0x20, 0x7e],
        [0xa0, 0xff],
        [0x100, 0x17f],
        [0x2000, 0x206f],
        [0x20a0, 0x20cf],
    ]

    const chars: string[] = []

    for (const [start, end] of ranges) {
        for (let cp = start; cp <= end; cp++) {
            chars.push(String.fromCodePoint(cp))
        }
    }

    return chars.join("")
}

async function buildFont(entry: FontEntry, text: string): Promise<void> {
    const inputPath = resolve(SOURCE_DIR, entry.file)
    const outputPath = resolve(OUTPUT_DIR, `${entry.family}-${entry.weight}.woff2`)

    const source = await readFile(inputPath)
    const subset = await subsetFont(source, text, { targetFormat: "woff2" })
    await writeFile(outputPath, subset)

    const inSize = (source.byteLength / 1024).toFixed(1)
    const outSize = (subset.byteLength / 1024).toFixed(1)
    console.log(`${entry.file}: ${inSize} KiB → ${outSize} KiB woff2`)
}

async function main(): Promise<void> {
    const text = buildSubsetText()

    for (const entry of FONTS) {
        await buildFont(entry, text)
    }
}

runEntrypoint(import.meta.url, main)
