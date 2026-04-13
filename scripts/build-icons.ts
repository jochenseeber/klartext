import { existsSync } from "node:fs"
import { copyFile, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import sharp from "sharp"
import toIco from "to-ico"

import { ROOT, runEntrypoint } from "./util.js"

const SOURCE = resolve(ROOT, "artwork/icon.svg")
const ICONS_DIR = resolve(ROOT, "docs/icons")
const FAVICON_PATH = resolve(ROOT, "docs/favicon.ico")

interface PngOutput {
    file: string
    size: number
    maskable?: boolean
}

const PNGS: readonly PngOutput[] = [
    { file: "icon-32.png", size: 32 },
    { file: "icon-180.png", size: 180 },
    { file: "icon-192.png", size: 192 },
    { file: "icon-512.png", size: 512 },
    { file: "icon-512-maskable.png", size: 512, maskable: true },
]

const ICO_SIZES = [16, 32, 48]

async function rasterize(svg: Buffer, size: number, maskable: boolean): Promise<Buffer> {
    if (maskable) {
        const inner = Math.round(size * 0.8)
        const padding = Math.round((size - inner) / 2)
        return sharp({
            create: {
                width: size,
                height: size,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .composite([{ input: await sharp(svg).resize(inner, inner).png().toBuffer(), left: padding, top: padding }])
            .png()
            .toBuffer()
    }

    return sharp(svg).resize(size, size).png().toBuffer()
}

async function main(): Promise<void> {
    if (!existsSync(SOURCE)) {
        throw new Error(`Missing source: ${SOURCE}. Export the favicon SVG from artwork/icon.afdesign.`)
    }

    const svg = await readFile(SOURCE)

    await copyFile(SOURCE, resolve(ICONS_DIR, "icon.svg"))
    console.log("Copied icon.svg")

    for (const png of PNGS) {
        const buf = await rasterize(svg, png.size, png.maskable === true)
        await writeFile(resolve(ICONS_DIR, png.file), buf)
        console.log(`Built ${png.file} (${png.size}×${png.size}${png.maskable === true ? " maskable" : ""})`)
    }

    const icoSources = await Promise.all(ICO_SIZES.map((size) => rasterize(svg, size, false)))
    const ico = await toIco(icoSources)
    await writeFile(FAVICON_PATH, ico)
    console.log(`Built favicon.ico (${ICO_SIZES.join(", ")})`)
}

runEntrypoint(import.meta.url, main)
