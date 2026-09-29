import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"

import { readPackageJson, ROOT, runEntrypoint } from "./util.js"

// Reads .extensionignore as zip exclude patterns. web-ext lets "**/" match the
// top level as well, zip does not, so "**/.DS_Store" also yields ".DS_Store".
function readExcludePatterns(ignorePath: string): string[] {
    const patterns = readFileSync(ignorePath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

    return patterns.flatMap((pattern) => pattern.startsWith("**/") ? [pattern, pattern.slice("**/".length)] : [pattern])
}

function main(): void {
    const { version } = readPackageJson()
    const distDir = resolve(ROOT, "dist")
    const pkgDir = resolve(ROOT, "pkg")
    const ignorePath = resolve(ROOT, ".extensionignore")
    const zipPath = resolve(pkgDir, `klartext-${version}.zip`)

    if (!existsSync(distDir)) {
        throw new Error(`dist/ not found at ${distDir}; run build first`)
    }

    mkdirSync(pkgDir, { recursive: true })
    rmSync(zipPath, { force: true })

    const result = spawnSync(
        "zip",
        ["-qr", zipPath, ".", "-x", ...readExcludePatterns(ignorePath)],
        { cwd: distDir, stdio: "inherit" },
    )

    if (result.error) {
        throw result.error
    }

    if (result.status !== 0) {
        throw new Error(`zip exited with status ${result.status ?? "unknown"}`)
    }
}

runEntrypoint(import.meta.url, main)
