import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"

import { readPackageJson, ROOT, runEntrypoint } from "./util.js"

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
        ["-qr", zipPath, ".", `-x@${ignorePath}`],
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
