import { globSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { fileURLToPath } from "node:url"

import { runEntrypoint } from "./util.js"

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)))
const projectRoot = resolve(scriptDirectory, "..")
const packageDir = join(projectRoot, "pkg")
const packageJsonPath = join(projectRoot, "package.json")

export type ZipRunner = (
    command: string,
    args: string[],
    options: { cwd: string; stdio: "inherit" },
) => SpawnSyncReturns<Buffer>

export const sourceIncludePatterns = [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "README.md",
    "LICENSE.txt",
    "src/**",
]

export const sourceExcludePatterns = [
    "**/*~",
    "**/*.tmp",
    "**/#*#",
    "**/.DS_Store",
]

function normalizeRelativePath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//, "")
}

function isFile(rootPath: string, relativePath: string): boolean {
    return statSync(join(rootPath, relativePath)).isFile()
}

function collectPatternFiles(rootPath: string, patterns: readonly string[]): Set<string> {
    const files = new Set<string>()

    for (const pattern of patterns) {
        for (const match of globSync(pattern, { cwd: rootPath })) {
            const relativePath = normalizeRelativePath(match)

            if (isFile(rootPath, relativePath)) {
                files.add(relativePath)
            }
        }
    }

    return files
}

export function collectFiles(
    rootPath = projectRoot,
    includePatterns: readonly string[] = sourceIncludePatterns,
    excludePatterns: readonly string[] = sourceExcludePatterns,
): string[] {
    const files = collectPatternFiles(rootPath, includePatterns)
    const excludedFiles = collectPatternFiles(rootPath, excludePatterns)

    for (const excludedFile of excludedFiles) {
        files.delete(excludedFile)
    }

    return [...files].sort()
}

export function readVersion(path = packageJsonPath): string {
    const packageJson = JSON.parse(readFileSync(path, "utf8")) as { version?: string }

    if (!packageJson.version) {
        throw new Error("package.json is missing a version field.")
    }

    return packageJson.version
}

export interface CreateSourcePackageOptions {
    rootPath?: string
    outputDirectory?: string
    version?: string
    zipRunner?: ZipRunner
}

export function createSourcePackage(options: CreateSourcePackageOptions = {}): string {
    const rootPath = options.rootPath ?? projectRoot
    const outputDirectory = options.outputDirectory ?? packageDir
    const version = options.version ?? readVersion(join(rootPath, "package.json"))
    const outputPath = join(outputDirectory, `klartext-${version}-source.zip`)
    const files = collectFiles(rootPath)
    const runZip = options.zipRunner ?? spawnSync

    mkdirSync(outputDirectory, { recursive: true })
    rmSync(outputPath, { force: true })

    const zip = runZip("zip", ["-q", outputPath, ...files], {
        cwd: rootPath,
        stdio: "inherit",
    })

    if (zip.error) {
        throw zip.error
    }

    if (zip.status !== 0) {
        throw new Error(`zip exited with status ${zip.status ?? "unknown"}.`)
    }

    return outputPath
}

function main(): void {
    const outputPath = createSourcePackage()

    console.log(`Created ${relative(projectRoot, outputPath)}`)
}

runEntrypoint(import.meta.url, main)
