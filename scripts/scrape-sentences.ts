import { spawn } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { load as cheerioLoad } from "cheerio"
import { type Browser, chromium, type Page } from "playwright"

import { ROOT, runEntrypoint } from "./util.js"

const TERMS = ["reform", "entlastung", "deregulierung"] as const
const ARTICLES_PER_TERM_PER_SITE = 20
const SEARCH_PAGES_PER_TERM = 3
const FETCH_CONCURRENCY = 4
const TRANSLATE_CONCURRENCY = 5
const WRAP_WIDTH = 79

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const SWEAR = "🤬"
const ARROW = "➡️"
const HEADING = "# Sentences"
const BLANK = /\n[ \t]*\n/

const SENTENCES_PATH = resolve(ROOT, "spec/sentences.md")

const USER_PROMPT_VERBATIM = `Suggest a translated sentence. The goal is to translate `
    + `all occurences of "Reform", "Entlastung", and "Deregulierung" mit `
    + `"Umverteilung von unten nach oben". The Result MUST be a German sentence with `
    + `correct grammar. It MUST hande tempus, plural and composite words correctly.`

interface Site {
    name: string
    searchUrl: (term: string, page: number) => string
    articleHrefPattern: RegExp
}

const SITES: readonly Site[] = [
    {
        name: "zeit",
        searchUrl: (q, p) => `https://www.zeit.de/suche/index?q=${encodeURIComponent(q)}&p=${p}`,
        articleHrefPattern: /^https:\/\/www\.zeit\.de\/[^/]+\/\d{4}-\d{2}\/[^?#]+$/,
    },
    {
        name: "spiegel",
        searchUrl: (q, p) => `https://www.spiegel.de/suche/?suchbegriff=${encodeURIComponent(q)}&seite=${p}`,
        // Articles live up to 3 category segments deep: /politik/deutschland/title-a-uuid.html
        articleHrefPattern: /^https:\/\/www\.spiegel\.de\/(?:[a-z][^/]*\/){1,4}[^/?#]*-a-[\w-]+\.html$/,
    },
    {
        name: "welt",
        searchUrl: (q, p) => `https://www.welt.de/suche/?query=${encodeURIComponent(q)}&page=${p}`,
        // Articles nest under 1-3 category segments: /wirtschaft/unternehmen/article12345/title.html
        articleHrefPattern: /^https:\/\/www\.welt\.de\/(?:[^/]+\/)*article\d+\//,
    },
    {
        name: "faz",
        searchUrl: (q, p) => `https://www.faz.net/suche/?query=${encodeURIComponent(q)}&page=${p}`,
        articleHrefPattern: /^https:\/\/www\.faz\.net\/aktuell\/[^?#]+-\d+\.html$/,
    },
    {
        name: "bild",
        searchUrl: (q, p) =>
            `https://www.bild.de/suche.bild.html?type=article&query=${encodeURIComponent(q)}&page=${p}`,
        articleHrefPattern: /^https:\/\/www\.bild\.de\/.*\.bild\.html(?:[?#]|$)/,
    },
]

interface Candidate {
    site: string
    term: string
    url: string
    title: string
    sentence: string
}

interface TranslatedCandidate extends Candidate {
    translation: string
}

function contentEnd(text: string, from: number): number {
    const blank = BLANK.exec(text.slice(from))
    const blankAt = blank === null ? Infinity : from + blank.index
    const swearAt = text.indexOf(SWEAR, from)
    const arrowAt = text.indexOf(ARROW, from)
    const candidates: number[] = [blankAt, text.length]

    if (swearAt !== -1) {
        candidates.push(swearAt)
    }

    if (arrowAt !== -1) {
        candidates.push(arrowAt)
    }

    return Math.min(...candidates)
}

function loadExistingSentences(): Set<string> {
    const set = new Set<string>()

    if (!existsSync(SENTENCES_PATH)) {
        return set
    }

    const text = readFileSync(SENTENCES_PATH, "utf8")
    let pos = 0

    while (true) {
        const swearAt = text.indexOf(SWEAR, pos)

        if (swearAt === -1) {
            break
        }

        const start = swearAt + SWEAR.length
        const end = contentEnd(text, start)
        const sentence = text.slice(start, end).replace(/\s+/g, " ").trim()

        if (sentence) {
            set.add(sentence)
        }

        pos = end
    }

    return set
}

async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array<R>(items.length)
    let i = 0

    async function worker(): Promise<void> {
        while (i < items.length) {
            const myIdx = i
            i += 1
            results[myIdx] = await fn(items[myIdx])
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
    await Promise.all(workers)
    return results
}

let _browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
    if (_browser === null) {
        _browser = await chromium.launch({ headless: true })
    }

    return _browser
}

const CONSENT_SELECTORS = [
    "button:has-text('Alle akzeptieren')",
    "button:has-text('Akzeptieren')",
    "button:has-text('Zustimmen')",
    "button:has-text('Einwilligen')",
    "[aria-label='Alle akzeptieren']",
    ".sp_choice_type_11",
]

async function dismissConsent(page: Page): Promise<void> {
    for (const sel of CONSENT_SELECTORS) {
        try {
            const el = page.locator(sel).first()

            if (await el.isVisible({ timeout: 1_500 })) {
                await el.click()
                await page.waitForTimeout(800)
                return
            }
        }
        catch {
            // try next selector
        }
    }
}

async function fetchHtml(url: string): Promise<string | null> {
    const browser = await getBrowser()
    const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: "de-DE",
        extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" },
        viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()

    try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })

        if (response === null || !response.ok()) {
            console.warn(`HTTP ${response?.status() ?? "?"} for ${url}`)
            return null
        }

        try {
            await page.waitForLoadState("networkidle", { timeout: 8_000 })
        }
        catch {
            // proceed with whatever has rendered so far
        }

        await dismissConsent(page)

        return await page.content()
    }
    catch (e) {
        console.warn(`fetch failed for ${url}: ${(e as Error).message}`)
        return null
    }
    finally {
        await context.close()
    }
}

function extractArticleUrls(html: string, site: Site): string[] {
    const $ = cheerioLoad(html)
    const origin = new URL(site.searchUrl("", 1)).origin
    const urls = new Set<string>()

    for (const el of $("a[href]").toArray()) {
        const href = $(el).attr("href")

        if (href === undefined) {
            continue
        }

        try {
            const absolute = new URL(href, origin).toString().split("#")[0]

            if (site.articleHrefPattern.test(absolute)) {
                urls.add(absolute)
            }
        }
        catch {
            // Ignore malformed URLs.
        }
    }

    return [...urls]
}

const BRAND_SUFFIX_RE = /\s*[|·\-–]\s*(?:DIE ZEIT|DER SPIEGEL|SPIEGEL|WELT|FAZ\.NET|F\.A\.Z\.|FAZ|Bild|BILD)\s*$/i

function extractArticle(html: string, term: string): { title: string; sentences: string[] } {
    const $ = cheerioLoad(html)
    const ogTitle = $("meta[property=\"og:title\"]").attr("content")
    const docTitle = $("title").text()
    const title = (ogTitle ?? docTitle).replace(/\s+/g, " ").replace(BRAND_SUFFIX_RE, "").trim()

    const paragraphs: string[] = []
    const bodySelector = "article p, main p, [itemprop='articleBody'] p, .article-body p, .article__body p, .RichText p"

    for (const el of $(bodySelector).toArray()) {
        const text = $(el).text().replace(/\s+/g, " ").trim()

        if (text) {
            paragraphs.push(text)
        }
    }

    const lcTerm = term.toLowerCase()
    const sentences: string[] = []
    const seen = new Set<string>()

    for (const paragraph of paragraphs) {
        const parts = paragraph.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/u)

        for (const part of parts) {
            const sentence = part.replace(/\s+/g, " ").trim()

            if (!sentence || !sentence.toLowerCase().includes(lcTerm) || seen.has(sentence)) {
                continue
            }

            seen.add(sentence)
            sentences.push(sentence)
        }
    }

    return { title, sentences }
}

async function scrapeSiteTerm(site: Site, term: string, dedupSet: Set<string>): Promise<Candidate[]> {
    const searchPages = await Promise.all(
        Array.from({ length: SEARCH_PAGES_PER_TERM }, (_, i) => fetchHtml(site.searchUrl(term, i + 1))),
    )

    const seenUrls = new Set<string>()
    const urls: string[] = []

    for (const html of searchPages) {
        if (html === null) {
            continue
        }

        for (const url of extractArticleUrls(html, site)) {
            if (seenUrls.has(url)) {
                continue
            }

            seenUrls.add(url)
            urls.push(url)

            if (urls.length >= ARTICLES_PER_TERM_PER_SITE) {
                break
            }
        }

        if (urls.length >= ARTICLES_PER_TERM_PER_SITE) {
            break
        }
    }

    console.log(`    ${site.name} / ${term}: ${urls.length} article URLs found`)
    const articles = await pool(urls, FETCH_CONCURRENCY, fetchHtml)
    const candidates: Candidate[] = []

    for (let i = 0; i < urls.length; i++) {
        const html = articles[i]

        if (html === null) {
            continue
        }

        const { title, sentences } = extractArticle(html, term)

        for (const sentence of sentences) {
            if (dedupSet.has(sentence)) {
                continue
            }

            dedupSet.add(sentence)
            candidates.push({ site: site.name, term, url: urls[i], title, sentence })
        }
    }

    return candidates
}

const TRANSLATION_PREAMBLE_RES: readonly RegExp[] = [
    /^Hier (?:ist|kommt) (?:die |eine |meine )?[ÜüU]bersetzung\s*[:–\-]?\s*/u,
    /^Hier die [ÜüU]bersetzung\s*[:–\-]?\s*/u,
    /^[ÜüU]bersetzung\s*[:–\-]?\s*/u,
    /^Translation\s*[:–\-]?\s*/iu,
]

function extractTranslation(stdout: string): string {
    let s = stdout.trim()

    for (const re of TRANSLATION_PREAMBLE_RES) {
        s = s.replace(re, "")
    }

    s = s.replace(/^["»“‚'`]+/u, "").replace(/["»”‚'`]+$/u, "")
    return s.replace(/\s+/g, " ").trim()
}

function callClaude(prompt: string): Promise<string | null> {
    return new Promise((resolveP) => {
        const child = spawn("claude", ["--model", "claude-sonnet-4-6", "-p"])
        let stdout = ""
        let stderr = ""

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8")
        })

        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8")
        })

        child.on("error", () => {
            resolveP(null)
        })

        child.on("close", (code) => {
            if (code === 0 && stdout.trim()) {
                resolveP(extractTranslation(stdout))
            }
            else {
                if (stderr.trim()) {
                    console.warn(`claude stderr: ${stderr.trim().slice(0, 200)}`)
                }

                resolveP(null)
            }
        })

        child.stdin.write(prompt)
        child.stdin.end()
    })
}

async function translate(sentence: string): Promise<string | null> {
    const prompt = `${USER_PROMPT_VERBATIM}\n\nSentence: ${sentence}\n\n`
        + "Reply with ONLY the translated sentence. No preamble, no explanation."

    for (let attempt = 0; attempt < 2; attempt++) {
        const translation = await callClaude(prompt)

        if (translation !== null && translation.length > 0) {
            return translation
        }
    }

    return null
}

function ensureHeader(): void {
    if (!existsSync(SENTENCES_PATH)) {
        writeFileSync(SENTENCES_PATH, `${HEADING}\n\n`)
        return
    }

    const text = readFileSync(SENTENCES_PATH, "utf8")

    if (!text.startsWith("# ")) {
        writeFileSync(SENTENCES_PATH, `${HEADING}\n\n${text}`)
    }
}

function escapeMarkdownLinkUrl(url: string): string {
    return url.replace(/([()])/g, "\\$1")
}

function wrap(text: string, width: number): string {
    const words = text.split(" ")
    const lines: string[] = []
    let current = ""

    for (const word of words) {
        const next = current ? `${current} ${word}` : word

        if (next.length > width && current) {
            lines.push(current)
            current = word
        }
        else {
            current = next
        }
    }

    if (current) {
        lines.push(current)
    }

    return lines.join("\n")
}

function appendEntry(c: TranslatedCandidate): void {
    const heading = `## [${c.title}](${escapeMarkdownLinkUrl(c.url)})`
    const swearLine = wrap(`${SWEAR} ${c.sentence}`, WRAP_WIDTH)
    const arrowLine = wrap(`${ARROW} ${c.translation}`, WRAP_WIDTH)
    const block = `${heading}\n\n${swearLine}\n\n${arrowLine}\n\n`
    appendFileSync(SENTENCES_PATH, block)
}

async function main(): Promise<void> {
    try {
        await run()
    }
    finally {
        if (_browser !== null) {
            await _browser.close()
            _browser = null
        }
    }
}

async function run(): Promise<void> {
    const dedupSet = loadExistingSentences()
    console.log(`existing corpus: ${dedupSet.size} sentences`)

    const allCandidates: Candidate[] = []

    for (const site of SITES) {
        for (const term of TERMS) {
            try {
                const candidates = await scrapeSiteTerm(site, term, dedupSet)
                console.log(`  ${site.name} / ${term}: ${candidates.length} new sentences`)
                allCandidates.push(...candidates)
            }
            catch (e) {
                console.warn(`  ${site.name} / ${term}: ${(e as Error).message}`)
            }
        }
    }

    console.log(`total new sentences to translate: ${allCandidates.length}`)

    if (allCandidates.length === 0) {
        return
    }

    ensureHeader()

    let translated = 0
    let failed = 0

    await pool(allCandidates, TRANSLATE_CONCURRENCY, async (candidate) => {
        const translation = await translate(candidate.sentence)

        if (translation === null) {
            failed += 1
            console.warn(`  translation failed: ${candidate.sentence.slice(0, 80)}…`)
            return
        }

        appendEntry({ ...candidate, translation })
        translated += 1

        if (translated % 10 === 0) {
            console.log(`  translated ${translated}/${allCandidates.length}…`)
        }
    })

    console.log(`done: ${translated} appended, ${failed} translation failures`)
}

runEntrypoint(import.meta.url, main)
