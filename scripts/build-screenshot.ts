import { existsSync } from "node:fs"
import { resolve } from "node:path"

import sharp from "sharp"

import { ROOT, runEntrypoint } from "./util.js"

const SOURCE = resolve(ROOT, "artwork/web/screenshot.png")
const OUTPUT_DIR = resolve(ROOT, "docs/assets")
const WIDTH = 1280
const HEIGHT = 800

async function main(): Promise<void> {
    if (!existsSync(SOURCE)) {
        throw new Error(
            `Missing source: ${SOURCE}. Drop a high-resolution screenshot master at artwork/web/screenshot.png.`,
        )
    }

    const base = sharp(SOURCE).resize({ width: WIDTH, height: HEIGHT, fit: "cover", position: "center" })

    await base.clone().avif({ quality: 50 }).toFile(resolve(OUTPUT_DIR, "screenshot.avif"))
    await base.clone().webp({ quality: 80 }).toFile(resolve(OUTPUT_DIR, "screenshot.webp"))
    await base.clone().png({ compressionLevel: 9, palette: true }).toFile(resolve(OUTPUT_DIR, "screenshot.png"))

    console.log(`Built ${WIDTH}×${HEIGHT} screenshot in avif/webp/png to docs/assets/`)
}

runEntrypoint(import.meta.url, main)
