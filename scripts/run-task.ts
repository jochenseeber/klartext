import { readPackageJson, run, runEntrypoint } from "./util.js"

import { parseArgs } from "node:util"

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchScripts(prefix: string, names: string[]): string[] {
    const pattern = new RegExp(`^${escapeRegExp(prefix)}:[^:]+$`)
    return names.filter((name) => pattern.test(name)).sort()
}

function runScript(name: string): void {
    console.log(`> pnpm run ${name}`)
    run("pnpm", ["run", name])
}

function printHelp(): void {
    console.log(
        `Usage: tsx scripts/run-task.ts <task>

Runs all <task>:prepare:* scripts (alphabetical), then all <task>:* scripts
(alphabetical, prepare ones excluded). Stops on first failure.

Options:
  -h, --help     Show this help and exit
`,
    )
}

function main(): void {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: { help: { type: "boolean", short: "h" } },
        allowPositionals: true,
        strict: true,
    })

    if (values.help) {
        printHelp()
        return
    }

    if (positionals.length !== 1) {
        throw new Error("exactly one task name is required (e.g. tsx scripts/run-task.ts format)")
    }

    const task = positionals[0]
    const scripts = Object.keys(readPackageJson().scripts ?? {})
    const prepare = matchScripts(`${task}:prepare`, scripts)
    const direct = matchScripts(task, scripts)

    for (const name of [...prepare, ...direct]) {
        runScript(name)
    }
}

runEntrypoint(import.meta.url, main)
