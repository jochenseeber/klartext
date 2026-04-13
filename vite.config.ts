import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"

const isDev = process.env.NODE_ENV !== "production"

function emitVersionedManifestPlugin(): Plugin {
    const manifestTemplatePath = resolve("src/manifest.json")
    const packageJsonPath = resolve("package.json")

    return {
        name: "klartext:manifest",
        apply: "build",
        buildStart() {
            this.addWatchFile(manifestTemplatePath)
            this.addWatchFile(packageJsonPath)

            const template = JSON.parse(readFileSync(manifestTemplatePath, "utf8")) as { version: string }
            const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }

            template.version = pkg.version

            this.emitFile({
                type: "asset",
                fileName: "manifest.json",
                source: JSON.stringify(template, null, 4) + "\n",
            })
        },
    }
}

export default defineConfig({
    publicDir: "static",
    define: {
        "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
    },
    plugins: [emitVersionedManifestPlugin()],
    build: {
        target: "chrome114",
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: isDev,
        minify: !isDev,
        lib: {
            entry: "src/content.ts",
            name: "Klartext",
            formats: ["iife"],
            fileName: () => "content.js",
        },
        rollupOptions: {
            output: {
                entryFileNames: "content.js",
                assetFileNames: "[name][extname]",
            },
        },
    },
})
