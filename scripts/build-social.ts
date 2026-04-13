import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import sharp from "sharp"

import { ROOT, runEntrypoint } from "./util.js"

const SOURCE = resolve(ROOT, "artwork/web/screenshot.png")

const OUTPUTS = [
    "docs/assets/social-card.jpg",
    "docs/assets/x-card.jpg",
]

const WIDTH = 1200
const HEIGHT = 630

async function main(): Promise<void> {
    if (!existsSync(SOURCE)) {
        throw new Error(
            `Missing source: ${SOURCE}. Drop a high-resolution screenshot master at artwork/web/screenshot.png.`,
        )
    }

    const card = await sharp(SOURCE)
        .resize({ width: WIDTH, height: HEIGHT, fit: "cover", position: "center" })
        .jpeg({ quality: 82, mozjpeg: true, progressive: true })
        .toBuffer()

    for (const output of OUTPUTS) {
        const outputPath = resolve(ROOT, output)
        await writeFile(outputPath, card)
        console.log(`Built ${output} (${WIDTH}×${HEIGHT})`)
    }
}

runEntrypoint(import.meta.url, main)
