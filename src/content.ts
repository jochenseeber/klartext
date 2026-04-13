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

const REPLACEMENT_RULES = new Map<RegExp, ReplacementRule>([
    [
        /\b(?:Reform der|Deregulierung der)\b/gu,
        {
            replacement: () => "Umverteilung von unten nach oben bei der",
        },
    ],
    [
        /\b(?:eine\s+)?Reform(?:en)?\b/gu,
        {
            replacement: () => "Vorschläge zur Umverteilung von unten nach oben",
        },
    ],
    [
        /\bEntlastung(?:en) der\b/gu,
        {
            replacement: () => "zusätzliche Wege zur Umverteilung von unten nach oben zu Lasten der ärmeren",
        },
    ],
    [
        /\bEntlastung(?:en)?\b/gu,
        {
            replacement: () => "zusätzliche Wege zur Umverteilung von unten nach oben",
        },
    ],
    [
        /\bDeregulierung\b/gu,
        {
            replacement: () => "vereinfachte Möglichkeiten zur Umverteilung von unten nach oben",
        },
    ],
    [
        /\b(?:Reform|Entlastungs|Deregulierungs)(?<suffix>[\p{L}]+)\b/gu,
        {
            replacement: (groups) => `${uc(groups.suffix ?? "")} zur Umverteilung von unten nach oben`,
        },
    ],
    [
        /\b(?<prefix>\p{Lu}\p{L}*)(?:s)reform\b/gu,
        {
            replacement: (groups) => `Umverteilung von unten nach oben bei ${groups.prefix ?? ""}`,
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
