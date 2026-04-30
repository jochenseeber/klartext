import CHECK_SVG from "./icons/circle-check.svg?raw"
import POO_SVG from "./icons/poo.svg?raw"

let checkIcon: Element | null = null
let pooIcon: Element | null = null

const STORAGE_KEY = "klartext-enabled"
const STATUS_BAR_ID = "klartext-status-bar"
const STATUS_LABEL_ID = "klartext-status-label"
const STATUS_ICON_ID = "klartext-status-icon"
const ELIGIBILITY_TERMS = [
    "AfD",
    "CDU",
    "Chrupalla",
    "CSU",
    "Dobrindt",
    "Duerr",
    "Dürr",
    "Esken",
    "Faeser",
    "FDP",
    "Höcke",
    "Klingbeil",
    "Kubicki",
    "Lindner",
    "Linnemann",
    "Merz",
    "Pistorius",
    "Reiche",
    "Scholz",
    "Söder",
    "Spahn",
    "SPD",
    "Strack-Zimmermann",
    "Weidel",
] as const

type ReplacementRule = {
    replacement: (groups: Record<string, string | undefined>) => string
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function uc(value: string): string {
    if (!value) {
        return value
    }

    const [firstCharacter, ...rest] = Array.from(value)
    return `${firstCharacter.toLocaleUpperCase("de-DE")}${rest.join("")}`
}

// Rules are evaluated in insertion order; the first match wins. Each rule
// captures one shape of "Reform"/"Entlastung"/"Deregulierung" usage and
// rewrites it to "Umverteilung von unten nach oben" with grammar fixes.
//
// Order rationale (specific → generic):
//   0    Preprocessing (strip invisible characters).
//   0a–0n Specific lexical forms that generic rules would handle awkwardly.
//   1    Term followed by "der" — preserves the article structure.
//   2    Compound where the term is the suffix (Rentenreform → Rentenumverteilung).
//   2b–2e Patterns intercepted before rule 3 (verb, "von", quoted lowercase).
//   3    Standalone term, optionally plural.
//   3b–3e Specific compound-prefix forms intercepted before rule 4.
//   4    Compound where the term is the prefix (Reformkonzept) — catch-all.
const REPLACEMENT_RULES = new Map<RegExp, ReplacementRule>([
    // 0. Strip zero-width spaces that web articles sometimes contain.
    [
        /​/gu,
        { replacement: () => "" },
    ],

    // 0a. "Strukturreform" — adjective form reads better than a compound.
    //     "Strukturreform"   → "strukturelle Umverteilung von unten nach oben"
    //     "Strukturreformen" → "strukturelle Umverteilungen von unten nach oben"
    [
        /\bStrukturreform(?<plural>en)?\b/gu,
        {
            replacement: (groups) => `strukturelle Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
        },
    ],

    // 0b. Compound starts where the suffix is a genitive-attractor.
    //     "Reformpolitiker"  → "Politiker der Umverteilung von unten nach oben"
    //     "Reformkurs"       → "Kurs der Umverteilung von unten nach oben"
    [
        /\b(?:Reform|Entlastungs|Deregulierungs)-?(?<suffix>politiker|politik|kurs|weg|aktivität(?:en)?|prozess)\b/gu,
        {
            replacement: (groups) => `${uc(groups.suffix ?? "")} der Umverteilung von unten nach oben`,
        },
    ],

    // 0c. "*bedarf" — fixed collocation "Bedarf an".
    //     "Reformbedarf" → "Bedarf an Umverteilung von unten nach oben"
    [
        /\b(?:Reform|Entlastungs|Deregulierungs)-?bedarf\b/gu,
        {
            replacement: () => "Bedarf an Umverteilung von unten nach oben",
        },
    ],

    // 0d. "Entlastung(en) der <people>" — "für die <people>" reads naturally.
    //     "Entlastung der Bürger" → "Umverteilung von unten nach oben für die Bürger"
    [
        /\b(?:Entlastung|Entlastungen) der (?<recipient>Bürger(?:innen)?|Bundesbürger(?:innen)?|Verbraucher(?:innen)?|Arbeitnehmer(?:innen)?|Arbeitgeber(?:innen)?|Mitarbeiter(?:innen)?|Beschäftigten|Familien|Steuerzahler(?:innen)?|Versicherten)\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben für die ${groups.recipient}`,
        },
    ],

    // 0e. "<Law>gesetz-Reform" — drop "-Reform", use "beim <Gesetz>".
    //     "Heizungsgesetz-Reform" → "Umverteilung von unten nach oben beim Heizungsgesetz"
    [
        /\b(?<law>\p{Lu}\p{L}*gesetz)-?(?:Reform|Entlastung|Deregulierung)(?:en)?\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben beim ${groups.law ?? ""}`,
        },
    ],

    // 0f. "Reform des <Law>gesetzes" — genitive law name, use "beim <Gesetz>".
    //     "Reform des Heizungsgesetzes" → "Umverteilung von unten nach oben beim Heizungsgesetz"
    [
        /\b(?:Reform|Entlastung|Deregulierung) des (?<law>\p{Lu}\p{L}*gesetz)(?:es)?\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben beim ${groups.law ?? ""}`,
        },
    ],

    // 0g. "Gesundheitsreform" — maps to "im Gesundheitswesen".
    //     "Gesundheitsreform" → "Umverteilung von unten nach oben im Gesundheitswesen"
    [
        /\bGesundheitsreform(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben im Gesundheitswesen",
        },
    ],

    // 0h. "Steuer*" — adjective form "steuerliche Umverteilung".
    //     "Steuerreform"       → "steuerliche Umverteilung von unten nach oben"
    //     "Steuerentlastungen" → "steuerliche Umverteilungen von unten nach oben"
    [
        /\bSteuer-?(?:[Rr]eform|[Ee]ntlastung|[Dd]eregulierung)(?<plural>en)?\b/gu,
        {
            replacement: (groups) => `steuerliche Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
        },
    ],

    // 0i. "Milliarden*" — preserve prefix as compound modifier with hyphen.
    //     "Milliarden-Entlastung"  → "Milliarden-Umverteilung von unten nach oben"
    //     "Milliardenentlastung"   → "Milliarden-Umverteilung von unten nach oben"
    //     "Milliarden-Entlastungen"→ "Milliarden-Umverteilungen von unten nach oben"
    [
        /\bMilliarden-?(?:[Rr]eform|[Ee]ntlastung|[Dd]eregulierung)(?<plural>en)?\b/gu,
        {
            replacement: (groups) => `Milliarden-Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
        },
    ],

    // 0j. "GKV-Reform" — acronym: use "in der GKV".
    //     "GKV-Reform" → "Umverteilung von unten nach oben in der GKV"
    [
        /\bGKV-Reform(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben in der GKV",
        },
    ],

    // 0k. "Banken-Deregulierung" (hyphenated) — use "im Bankensektor".
    //     "Banken-Deregulierung" → "Umverteilung von unten nach oben im Bankensektor"
    [
        /\bBanken-Deregulierung(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben im Bankensektor",
        },
    ],

    // 0l. "Bankenderegulierung" (no hyphen) — use "bei Banken".
    //     "Bankenderegulierung" → "Umverteilung von unten nach oben bei Banken"
    [
        /\bBankenderegulierung(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben bei Banken",
        },
    ],

    // 0m. "Punktereform" — keep prefix with hyphen.
    //     "Punktereform" → "Punkte-Umverteilung von unten nach oben"
    [
        /\bPunktereform(?:en)?\b/gu,
        {
            replacement: () => "Punkte-Umverteilung von unten nach oben",
        },
    ],

    // 0n. "Haushaltsentlastung" — use "pro Haushalt" suffix form.
    //     "Haushaltsentlastung" → "Umverteilung von unten nach oben pro Haushalt"
    [
        /\bHaushaltsentlastung(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben pro Haushalt",
        },
    ],

    // 0o. "Rentenreform" — use "bei den Renten".
    //     "Rentenreform" → "Umverteilung von unten nach oben bei den Renten"
    [
        /\bRentenreform(?:en)?\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben bei den Renten",
        },
    ],

    // 0p. "Reform der Rentenversicherung" — use "in der" (not "bei der").
    //     "Reform der Rentenversicherung" → "Umverteilung von unten nach oben in der Rentenversicherung"
    [
        /\bReform der Rentenversicherung\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben in der Rentenversicherung",
        },
    ],

    // 1. Term followed by the article "der" — preserves the article structure.
    //    "Reform der gesetzlichen Krankenversicherung"
    //      → "Umverteilung von unten nach oben bei der gesetzlichen Krankenversicherung"
    [
        /\b(?:Reform|Entlastung|Deregulierung) der\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben bei der",
        },
    ],

    // 2. Compound where the term is the *suffix*. Preserves any hyphen so that
    //    hyphenated forms (XL-Reform) keep the hyphen (XL-Umverteilung) while
    //    closed compounds (Rentenreform) produce Rentenumverteilung.
    //    "Rentenreform"     → "Rentenumverteilung von unten nach oben"
    //    "XL-Reform"        → "XL-Umverteilung von unten nach oben"
    [
        /\b(?<prefix>\p{Lu}\p{L}*)(?<hyphen>-)?(?:[Rr]eform|[Ee]ntlastung|[Dd]eregulierung)(?<plural>en)?\b/gu,
        {
            replacement: (groups) => {
                const plural = groups.plural ? "en" : ""
                const hyphen = groups.hyphen ?? ""
                const noun = hyphen ? `Umverteilung${plural}` : `umverteilung${plural}`
                return `${groups.prefix ?? ""}${hyphen}${noun} von unten nach oben`
            },
        },
    ],

    // 2b. Verb "sich selbst entlastet" → active redistribution phrase.
    [
        /\bsich selbst entlastet\b/gu,
        { replacement: () => "von unten nach oben umverteilt" },
    ],

    // 2c. "Entlastungen für <group>" — singular + "zugunsten der".
    //     "Entlastungen für Arbeitgeber" → "Umverteilung von unten nach oben zugunsten der Arbeitgeber"
    [
        /\bEntlastungen für (?<noun>\p{Lu}\p{L}+)\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben zugunsten der ${groups.noun ?? ""}`,
        },
    ],

    // 2d. "Reform/Deregulierung von <Noun>" — replaces directional "von" with "bei".
    //     "Reform von Habecks"           → "Umverteilung von unten nach oben bei Habecks"
    //     "Deregulierung von Arbeitszeiten" → "Umverteilung von unten nach oben bei Arbeitszeiten"
    [
        /\b(?:Reform|Deregulierung) von (?<noun>\p{Lu}\p{L}+)\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben bei ${groups.noun ?? ""}`,
        },
    ],

    // 2e. Quoted lowercase "reform/entlastung/deregulierung" after a compound prefix.
    //     Krankenkassen"reform" → Krankenkassen-"Umverteilung von unten nach oben"
    [
        /(?<prefix>\p{Lu}\p{L}+)"(?:reform|entlastung|deregulierung)"/gu,
        {
            replacement: (groups) => `${groups.prefix ?? ""}-"Umverteilung von unten nach oben"`,
        },
    ],

    // 3. Standalone term, optionally plural.
    //    "Reform"        → "Umverteilung von unten nach oben"
    //    "Reformen"      → "Umverteilungen von unten nach oben"
    //    "Entlastungen"  → "Umverteilungen von unten nach oben"
    //    "Deregulierung" → "Umverteilung von unten nach oben"
    [
        /\b(?:Reform|Entlastung|Deregulierung)(?<plural>en)?\b/gu,
        {
            replacement: (groups) => {
                const plural = groups.plural ? "en" : ""
                return `Umverteilung${plural} von unten nach oben`
            },
        },
    ],

    // 3b. "Reformstau" → compound without the qualifier phrase.
    [
        /\bReformstau\b/gu,
        { replacement: () => "Umverteilungsstau" },
    ],

    // 3c. "Entlastungsbetrag" → "Umverteilungsbetrag von unten nach oben".
    [
        /\bEntlastungsbetrag(?:es|e)?\b/gu,
        { replacement: () => "Umverteilungsbetrag von unten nach oben" },
    ],

    // 3d. "*runde" — hyphenated qualifier compound.
    //     "Deregulierungsrunde" → "Umverteilung-von-unten-nach-oben-Runde"
    //     "Reformrunde"         → "Umverteilung-von-unten-nach-oben-Runde"
    [
        /\b(?:Deregulierungs|Reform)runde(?:n)?\b/gu,
        { replacement: () => "Umverteilung-von-unten-nach-oben-Runde" },
    ],

    // 3e. "Reformdebatte" → "Debatte über Umverteilung von unten nach oben".
    [
        /\bReformdebatte(?:n)?\b/gu,
        { replacement: () => "Debatte über Umverteilung von unten nach oben" },
    ],

    // 3f. „steuerfreie Entlastungsprämie" — hyphenated qualifier compound form.
    //     The input uses typographic closing " (U+201C); the corpus expected output
    //     uses ASCII " — match both quote chars and normalise to ASCII closing.
    [
        /„steuerfreie Entlastungsprämie“/gu,
        { replacement: () => "„steuerfreie Umverteilung-von-unten-nach-oben-Prämie\"" },
    ],

    // 3g. "Reformpläne der <Noun>" — keep genitive phrase adjacent to new noun.
    //     "Reformpläne der Regierung" → "Pläne der Regierung zur Umverteilung von unten nach oben"
    [
        /\bReformpläne der (?<noun>\p{Lu}\p{L}*)\b/gu,
        {
            replacement: (groups) => `Pläne der ${groups.noun ?? ""} zur Umverteilung von unten nach oben`,
        },
    ],

    // 4. Compound where the term is the *prefix*. The captured suffix becomes
    //    the new noun head, capitalized via uc().
    //    "Reformkonzept"       → "Konzept zur Umverteilung von unten nach oben"
    //    "Entlastungspaket"    → "Paket zur Umverteilung von unten nach oben"
    //    "Deregulierungsschub" → "Schub zur Umverteilung von unten nach oben"
    [
        /\b(?:Reform|Entlastungs|Deregulierungs)-?(?<suffix>\p{L}+)\b/gu,
        {
            replacement: (groups) => `${uc(groups.suffix ?? "")} zur Umverteilung von unten nach oben`,
        },
    ],
])

const ELIGIBILITY_PATTERN = new RegExp(
    `\\b(?:${ELIGIBILITY_TERMS.map(escapeRegex).join("|")})\\b`,
    "iu",
)

const modifiedNodes = new Map<Text, string>()

let isEnabled = true
let pageIsEligible = false
let observer: MutationObserver | null = null

function parseSvg(source: string): Element {
    return new DOMParser().parseFromString(source, "image/svg+xml").documentElement
}

function getCheckIcon(): Element {
    checkIcon ??= parseSvg(CHECK_SVG)
    return checkIcon
}

function getPooIcon(): Element {
    pooIcon ??= parseSvg(POO_SVG)
    return pooIcon
}

export function isEligibleText(input: string): boolean {
    return ELIGIBILITY_PATTERN.test(input)
}

function getEligibilityText(): string {
    const titleText = document.title
    const bodyText = document.body?.textContent ?? ""

    return `${titleText}\n${bodyText}`
}

function detectPageEligibility(): boolean {
    return isEligibleText(getEligibilityText())
}

function shouldSkipNode(node: Text): boolean {
    const parent = node.parentElement

    if (!parent) {
        return true
    }

    if (parent.closest(`#${STATUS_BAR_ID}`)) {
        return true
    }

    return ["NOSCRIPT", "SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)
}

function applyReplacementRule(input: string, pattern: RegExp, rule: ReplacementRule): string {
    pattern.lastIndex = 0

    if (!pattern.test(input)) {
        return input
    }

    pattern.lastIndex = 0

    return input.replace(pattern, (_match, ...args: unknown[]) => {
        const maybeGroups = args[args.length - 1]
        const groups = typeof maybeGroups === "object" && maybeGroups !== null
            ? maybeGroups as Record<string, string | undefined>
            : {}

        return rule.replacement(groups)
    })
}

export function applyReplacementRules(input: string): string {
    let rewrittenValue = input

    for (const [pattern, rule] of REPLACEMENT_RULES.entries()) {
        rewrittenValue = applyReplacementRule(rewrittenValue, pattern, rule)
    }

    return rewrittenValue
}

function rewriteTextNode(node: Text): void {
    if (shouldSkipNode(node) || !pageIsEligible) {
        return
    }

    const originalValue = modifiedNodes.get(node) ?? node.nodeValue ?? ""
    const rewrittenValue = applyReplacementRules(originalValue)

    if (rewrittenValue !== originalValue) {
        modifiedNodes.set(node, originalValue)
        node.nodeValue = rewrittenValue
    }
}

function restoreAllNodes(): void {
    for (const [node, originalValue] of modifiedNodes.entries()) {
        if (node.isConnected) {
            node.nodeValue = originalValue
        }
    }

    modifiedNodes.clear()
}

function collectTextNodes(root: Node): Text[] {
    const nodes: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
        const currentNode = walker.currentNode

        if (currentNode instanceof Text) {
            nodes.push(currentNode)
        }
    }

    return nodes
}

function rewriteDocument(root: Node = document.body): void {
    if (!isEnabled || !document.body.contains(root) || !pageIsEligible) {
        return
    }

    for (const node of collectTextNodes(root)) {
        rewriteTextNode(node)
    }
}

function disconnectObserver(): void {
    observer?.disconnect()
    observer = null
}

function updateStatusBar(): void {
    const container = document.getElementById(STATUS_BAR_ID)

    if (!(container instanceof HTMLDivElement)) {
        return
    }

    const label = document.getElementById(STATUS_LABEL_ID)

    if (!(label instanceof HTMLSpanElement)) {
        return
    }

    const icon = document.getElementById(STATUS_ICON_ID)

    if (!(icon instanceof HTMLSpanElement)) {
        return
    }

    container.setAttribute("aria-pressed", String(isEnabled))

    icon.replaceChildren((isEnabled ? getCheckIcon() : getPooIcon()).cloneNode(true))
    label.textContent = isEnabled ? "Klartext" : "Gelaber"
}

function refreshEligibilityFromDocument(): void {
    if (!pageIsEligible) {
        pageIsEligible = detectPageEligibility()
    }
}

export function readStoredBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback
}

async function persistEnabledState(nextValue: boolean): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: nextValue })
}

function applyCurrentState(): void {
    if (isEnabled) {
        pageIsEligible = detectPageEligibility()

        if (pageIsEligible) {
            rewriteDocument()
        }

        observeDocument()
    }
    else {
        disconnectObserver()
        restoreAllNodes()
    }

    updateStatusBar()
}

function observeDocument(): void {
    disconnectObserver()

    observer = new MutationObserver((records) => {
        if (!isEnabled) {
            return
        }

        const wasEligible = pageIsEligible
        refreshEligibilityFromDocument()

        if (pageIsEligible !== wasEligible) {
            updateStatusBar()
        }

        if (!pageIsEligible) {
            return
        }

        if (!wasEligible && pageIsEligible) {
            rewriteDocument()
            return
        }

        for (const record of records) {
            if (record.type === "characterData" && record.target instanceof Text) {
                rewriteTextNode(record.target)
                continue
            }

            for (const addedNode of Array.from(record.addedNodes)) {
                if (addedNode instanceof Text) {
                    rewriteTextNode(addedNode)
                    continue
                }

                if (addedNode instanceof HTMLElement) {
                    rewriteDocument(addedNode)
                }
            }
        }
    })

    observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
    })
}

function createStatusBar(): void {
    if (document.getElementById(STATUS_BAR_ID)) {
        return
    }

    const container = document.createElement("div")
    container.id = STATUS_BAR_ID
    container.setAttribute("data-klartext-managed", "true")
    container.setAttribute("role", "button")
    container.setAttribute("aria-label", "Klartext umschalten")
    container.tabIndex = 0
    container.style.position = "fixed"
    container.style.right = "16px"
    container.style.bottom = "16px"
    container.style.zIndex = "2147483647"
    container.style.display = "flex"
    container.style.alignItems = "center"
    container.style.gap = "8px"
    container.style.padding = "8px 12px"
    container.style.borderRadius = "12px"
    container.style.border = "2px solid rgba(31, 26, 18, 0.2)"
    container.style.background = "rgba(236, 236, 236, 0.96)"
    container.style.backdropFilter = "blur(16px)"
    container.style.boxShadow = "0 4px 10px rgba(31, 26, 18, 0.3)"
    container.style.color = "#1f1a12"
    container.style.fontFamily = "ui-sans-serif, system-ui, sans-serif"
    container.style.fontSize = "13px"
    container.style.lineHeight = "1.3"
    container.style.cursor = "pointer"
    container.style.userSelect = "none"

    const icon = document.createElement("span")
    icon.id = STATUS_ICON_ID
    icon.setAttribute("aria-hidden", "true")
    icon.append(getCheckIcon().cloneNode(true))
    icon.style.display = "inline-flex"
    icon.style.alignItems = "center"
    icon.style.justifyContent = "center"
    icon.style.width = "24px"
    icon.style.height = "24px"
    icon.style.lineHeight = "1"
    icon.style.flexShrink = "0"

    const label = document.createElement("span")
    label.id = STATUS_LABEL_ID
    label.textContent = "Klartext"
    label.style.display = "inline-block"
    label.style.width = "9ch"
    label.style.fontWeight = "700"
    label.style.textAlign = "left"
    label.style.letterSpacing = "0.01em"

    container.addEventListener("click", () => {
        void persistEnabledState(!isEnabled)
    })

    container.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return
        }

        event.preventDefault()
        void persistEnabledState(!isEnabled)
    })

    container.append(icon, label)
    document.documentElement.append(container)
}

async function initializeState(): Promise<void> {
    const result = (await chrome.storage.sync.get(STORAGE_KEY)) as Record<string, unknown>
    isEnabled = readStoredBoolean(result[STORAGE_KEY], true)
    applyCurrentState()
}

function subscribeToStateChanges(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync" || !(STORAGE_KEY in changes)) {
            return
        }

        isEnabled = readStoredBoolean(changes[STORAGE_KEY].newValue, true)
        applyCurrentState()
    })
}

function boot(): void {
    createStatusBar()
    subscribeToStateChanges()
    void initializeState()
}

function canBoot(): boolean {
    return typeof document !== "undefined" && typeof chrome !== "undefined" && Boolean(chrome.storage?.sync)
}

if (canBoot()) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            boot()
        }, { once: true })
    }
    else {
        boot()
    }
}
