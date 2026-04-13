import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PKG_PATH = resolve(ROOT, "package.json")
const DPRINT_FILE_RE = /\.(?:[cm]?[jt]sx?|json|md|ya?ml)$/i
const ESLINT_FILE_RE = /\.(?:[cm]?[jt]sx?)$/i

const DEFAULT_RELEASE_REF_PREFIX = "v"
const DEFAULT_RELEASE_BRANCH_SUFFIX = "-dev"

export interface PackageJson {
    name: string
    version: string
    preview?: boolean
    releaseRefPrefix?: string
    releaseBranchSuffix?: string
    scripts?: Record<string, string>
}

export interface ReleaseConfig {
    refPrefix: string
    branchSuffix: string
}

export function readPackageJson(): PackageJson {
    return JSON.parse(readFileSync(PKG_PATH, "utf8")) as PackageJson
}

export function readReleaseConfig(pkg: PackageJson = readPackageJson()): ReleaseConfig {
    return {
        refPrefix: pkg.releaseRefPrefix ?? DEFAULT_RELEASE_REF_PREFIX,
        branchSuffix: pkg.releaseBranchSuffix ?? DEFAULT_RELEASE_BRANCH_SUFFIX,
    }
}

export function writeVersion(version: string): void {
    const raw = readFileSync(PKG_PATH, "utf8")

    if (!/("version"\s*:\s*")([^"]+)(")/.test(raw)) {
        throw new Error(`Could not find version field in ${PKG_PATH}.`)
    }

    let updated = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`)

    if (/("preview"\s*:\s*)(true|false)/.test(raw)) {
        const preview = shouldPreviewVersion(version)
        updated = updated.replace(/("preview"\s*:\s*)(true|false)/, `$1${preview}`)
    }

    if (updated === raw) {
        return
    }

    writeFormattedTextFile(PKG_PATH, updated)
}

export interface Version {
    major: number
    minor: number
    patch: number
    prerelease: string | null
}

export function parseVersion(v: string): Version {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v)
    if (!m) throw new Error(`Invalid version: ${v}`)
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        prerelease: m[4] ?? null,
    }
}

export function formatVersion(v: Version): string {
    const base = `${v.major}.${v.minor}.${v.patch}`
    return v.prerelease ? `${base}-${v.prerelease}` : base
}

export interface PrereleaseInfo {
    isPrerelease: boolean
    isDev: boolean
}

export function parsePrerelease(version: string): PrereleaseInfo {
    const { prerelease } = parseVersion(version)
    return {
        isPrerelease: prerelease !== null,
        isDev: prerelease === "dev",
    }
}

export function shouldPreviewVersion(version: string): boolean {
    return parsePrerelease(version).isPrerelease
}

export function releaseTag(pkg: PackageJson = readPackageJson()): string {
    return `${readReleaseConfig(pkg).refPrefix}${pkg.version}`
}

export function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): void {
    try {
        execFileSync(cmd, args, {
            cwd: ROOT,
            env: env ? { ...process.env, ...env } : process.env,
            stdio: "inherit",
        })
    }
    catch (e) {
        const err = e as { status?: number | null }
        const status = err.status != null ? ` (exit ${err.status})` : ""
        throw new Error(`${cmd} ${args.join(" ")} failed${status}`)
    }
}

function normalizePaths(paths: string[]): string[] {
    const normalized = new Set<string>()

    for (const path of paths) {
        const absolutePath = resolve(ROOT, path)

        if (!existsSync(absolutePath)) {
            continue
        }

        normalized.add(relative(ROOT, absolutePath))
    }

    return [...normalized]
}

export function formatFiles(paths: string[]): void {
    const normalizedPaths = normalizePaths(paths)

    if (normalizedPaths.length === 0) {
        return
    }

    const dprintPaths = normalizedPaths.filter((path) => DPRINT_FILE_RE.test(path))

    if (dprintPaths.length > 0) {
        run("pnpm", ["exec", "dprint", "fmt", "--", ...dprintPaths])
    }

    const eslintPaths = normalizedPaths.filter((path) => ESLINT_FILE_RE.test(path))

    if (eslintPaths.length > 0) {
        run("pnpm", ["exec", "eslint", "--fix", "--", ...eslintPaths])
    }
}

export function writeFormattedTextFile(path: string, content: string): boolean {
    const absolutePath = resolve(ROOT, path)
    const currentContent = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null

    if (currentContent === content) {
        return false
    }

    writeFileSync(absolutePath, content)
    formatFiles([absolutePath])
    return true
}

export function capture(cmd: string, args: string[]): string {
    try {
        return execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT }).trim()
    }
    catch (e) {
        const err = e as { stderr?: Buffer; message: string }
        const msg = err.stderr?.toString().trim() || err.message
        throw new Error(`${cmd} ${args.join(" ")} failed:\n${msg}`)
    }
}

export function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Required environment variable ${name} is not set.`)
    return value
}

export function assertGithubAuth(): void {
    if (process.env.GITHUB_TOKEN) {
        return
    }

    try {
        capture("gh", ["auth", "status"])
    }
    catch {
        throw new Error(
            "GitHub auth not available. Set GITHUB_TOKEN or authenticate the gh CLI with 'gh auth login'.",
        )
    }
}

export function assertCleanWorkspace(): void {
    const status = capture("git", ["status", "--porcelain"])

    if (status) {
        throw new Error(`Workspace is not clean:\n${status}`)
    }
}

export function assertPublishable(pkg: PackageJson): void {
    assertCleanWorkspace()

    const { isDev } = parsePrerelease(pkg.version)

    if (isDev) {
        throw new Error(`Cannot publish dev version ${pkg.version}. Run the release script first.`)
    }

    const tag = releaseTag(pkg)
    const refName = process.env.GITHUB_REF_NAME

    if (refName && refName !== tag) {
        throw new Error(`GITHUB_REF_NAME=${refName} does not match release tag ${tag}.`)
    }
}

export function isEntrypoint(metaUrl: string): boolean {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(metaUrl)
}

export function runEntrypoint(metaUrl: string, main: () => Promise<void> | void): void {
    if (!isEntrypoint(metaUrl)) return

    Promise.resolve(main()).catch((err: Error) => {
        console.error(err.message)
        process.exit(1)
    })
}
