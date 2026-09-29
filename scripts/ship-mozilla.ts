import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { assertPublishable, readPackageJson, requireEnv, ROOT, run, runEntrypoint } from "./util.js"

// web-ext reads the AMO credentials from these variables itself, so they never
// appear on a command line.
const API_KEY_VAR = "WEB_EXT_API_KEY"
const API_SECRET_VAR = "WEB_EXT_API_SECRET"

const DIST_DIR = resolve(ROOT, "dist")
const ARTIFACTS_DIR = resolve(ROOT, "pkg", "web-ext")

// Submits dist/ as a new listed version on addons.mozilla.org, together with
// the source archive AMO needs to review the minified content script. Does not
// wait for approval; AMO emails the result.
export function shipMozilla(): void {
    const pkg = readPackageJson()
    assertPublishable(pkg)

    requireEnv(API_KEY_VAR)
    requireEnv(API_SECRET_VAR)

    const sourceZip = resolve(ROOT, "pkg", `klartext-${pkg.version}-source.zip`)

    if (!existsSync(sourceZip)) {
        throw new Error(`Source archive not found at ${sourceZip}. Run the package target first.`)
    }

    run("pnpm", [
        "exec",
        "web-ext",
        "sign",
        `--source-dir=${DIST_DIR}`,
        `--artifacts-dir=${ARTIFACTS_DIR}`,
        "--channel=listed",
        `--upload-source-code=${sourceZip}`,
        "--approval-timeout=0",
    ])
}

runEntrypoint(import.meta.url, shipMozilla)
