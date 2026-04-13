import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import sharp from "sharp"

import { ROOT, runEntrypoint } from "./util.js"

interface Manifest {
    icons?: Record<string, string>
    action?: {
        default_icon?: Record<string, string>
    }
}

const MANIFEST_PATH = resolve(ROOT, "src/manifest.json")
const STATIC_DIR = resolve(ROOT, "static")
const SVG_PATH = resolve(ROOT, "artwork/icon.svg")

function collectIcons(manifest: Manifest): Map<string, number> {
    const icons = new Map<string, number>()

    const record = (entries: Record<string, string> | undefined): void => {
        if (entries === undefined) {
            return
        }

        for (const [size, path] of Object.entries(entries)) {
            const dimension = Number(size)

            if (!Number.isInteger(dimension) || dimension <= 0) {
                throw new Error(`Invalid icon size '${size}' for '${path}' in ${MANIFEST_PATH}`)
            }

            const existing = icons.get(path)

            if (existing !== undefined && existing !== dimension) {
                throw new Error(
                    `Conflicting sizes declared for '${path}' in ${MANIFEST_PATH}: ${existing} and ${dimension}`,
                )
            }

            icons.set(path, dimension)
        }
    }

    record(manifest.icons)
    record(manifest.action?.default_icon)

    return icons
}

async function main(): Promise<void> {
    if (!existsSync(SVG_PATH)) {
        throw new Error(`Missing source: ${SVG_PATH}. Export the icon SVG from artwork/icon.afdesign.`)
    }

    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest
    const svg = await readFile(SVG_PATH)
    const icons = collectIcons(manifest)

    if (icons.size === 0) {
        throw new Error(`No icons declared in ${MANIFEST_PATH}`)
    }

    for (const [relativePath, size] of icons) {
        const outputPath = resolve(STATIC_DIR, relativePath)
        await mkdir(dirname(outputPath), { recursive: true })

        const buffer = await sharp(svg).resize(size, size).png().toBuffer()
        await writeFile(outputPath, buffer)

        console.log(`Built static/${relativePath} (${size}×${size})`)
    }
}

runEntrypoint(import.meta.url, main)
