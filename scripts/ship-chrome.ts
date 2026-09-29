import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { assertPublishable, readPackageJson, requireEnv, ROOT, runEntrypoint } from "./util.js"

// Chrome Web Store item of the extension, as linked from docs/index.html.
const ITEM_ID = "okcbfckdamfipbdlcpdombmdpnafmokh"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API_URL = "https://chromewebstore.googleapis.com"

const POLL_INTERVAL_MS = 5_000
const POLL_ATTEMPTS = 24

type UploadState = "UPLOAD_STATE_UNSPECIFIED" | "SUCCEEDED" | "IN_PROGRESS" | "FAILED" | "NOT_FOUND"

interface UploadResponse {
    crxVersion?: string
    uploadState?: UploadState
}

interface StatusResponse {
    lastAsyncUploadState?: UploadState
}

interface PublishResponse {
    state?: string
}

interface TokenResponse {
    access_token?: string
}

// Reads the response body and throws with it for non-2xx responses. Google's
// error bodies carry the reason but never the credentials.
async function readJson<T>(response: Response, action: string): Promise<T> {
    const body = await response.text()

    if (!response.ok) {
        throw new Error(`${action} failed with HTTP ${response.status}: ${body}`)
    }

    return JSON.parse(body) as T
}

async function fetchAccessToken(): Promise<string> {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        body: new URLSearchParams({
            client_id: requireEnv("CHROME_CLIENT_ID"),
            client_secret: requireEnv("CHROME_CLIENT_SECRET"),
            refresh_token: requireEnv("CHROME_REFRESH_TOKEN"),
            grant_type: "refresh_token",
        }),
    })

    const { access_token: token } = await readJson<TokenResponse>(response, "Access token request")

    if (!token) {
        throw new Error("Access token request returned no token.")
    }

    return token
}

async function waitForUpload(itemPath: string, headers: Record<string, string>): Promise<void> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS))

        const response = await fetch(`${API_URL}/v2/${itemPath}:fetchStatus`, { headers })
        const { lastAsyncUploadState: state } = await readJson<StatusResponse>(response, "Status request")

        if (state === "SUCCEEDED") {
            return
        }

        if (state !== "IN_PROGRESS") {
            throw new Error(`Upload ended in state ${state ?? "unknown"}.`)
        }
    }

    throw new Error(`Upload still in progress after ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`)
}

// Uploads pkg/klartext-<version>.zip to the Chrome Web Store and submits it
// for review. The store publishes the new version once the review passes.
export async function shipChrome(): Promise<void> {
    const pkg = readPackageJson()
    assertPublishable(pkg)

    const zipPath = resolve(ROOT, "pkg", `klartext-${pkg.version}.zip`)

    if (!existsSync(zipPath)) {
        throw new Error(`Extension archive not found at ${zipPath}. Run the package target first.`)
    }

    const itemPath = `publishers/${requireEnv("CHROME_PUBLISHER_ID")}/items/${ITEM_ID}`
    const headers = { Authorization: `Bearer ${await fetchAccessToken()}` }

    const uploadResponse = await fetch(`${API_URL}/upload/v2/${itemPath}:upload`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/zip" },
        body: readFileSync(zipPath),
    })
    const upload = await readJson<UploadResponse>(uploadResponse, "Upload")

    if (upload.uploadState === "IN_PROGRESS") {
        await waitForUpload(itemPath, headers)
    }
    else if (upload.uploadState !== "SUCCEEDED") {
        throw new Error(`Upload ended in state ${upload.uploadState ?? "unknown"}.`)
    }

    console.log(`Uploaded ${pkg.version} to item ${ITEM_ID}.`)

    const publishResponse = await fetch(`${API_URL}/v2/${itemPath}:publish`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
    })
    const { state } = await readJson<PublishResponse>(publishResponse, "Publish request")

    console.log(`Submitted for publishing; item state: ${state ?? "unknown"}.`)
}

runEntrypoint(import.meta.url, shipChrome)
