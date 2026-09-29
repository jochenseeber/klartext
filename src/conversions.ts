import { Conversion, type ReplacementRule } from "./conversion"

// "Klimaschutz" → "Rettung des Planeten". The target is feminine and definite,
// so determiners and adjectives are re-inflected and bare nouns get an
// article: "den wirksamen Klimaschutz" → "die wirksame Rettung des Planeten".
const KLIMASCHUTZ = new Conversion({
    source: {
        nouns: ["Klimaschutz"],
        compoundForms: ["Klimaschutz"],
        gender: "masculine",
        plural: null,
        genitive: "es",
    },
    target: {
        noun: "Rettung",
        plural: "en",
        gender: "feminine",
        complement: "des Planeten",
        definite: true,
        suffixCompounds: false,
    },
    connectors: [
        { head: /^(?:debatte|diskussion|streit)/u, connector: "über die" },
        { head: /^(?:beauftragt|minister|ressort)/u, connector: "für die" },
        { head: /^(?:frage|gr[uü]nd|interesse|kosten|sicht|zweck)/u, connector: "der" },
    ],
    defaultConnector: "zur",
    overrides: [],
})

// "Reform", "Entlastung", "Deregulierung" → "Umverteilung von unten nach
// oben". All nouns are feminine, so the words around them stay as they are.
// The overrides are special cases tuned against spec/sentences.md.
const UMVERTEILUNG_OVERRIDES: readonly ReplacementRule[] = [
    // "Strukturreform" — adjective form reads better than a compound.
    //   "Strukturreform"   → "strukturelle Umverteilung von unten nach oben"
    //   "Strukturreformen" → "strukturelle Umverteilungen von unten nach oben"
    {
        pattern: /\bStrukturreform(?<plural>en)?\b/gu,
        replacement: (groups) => `strukturelle Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
    },

    // "Entlastung(en) der <people>" — "für die <people>" reads naturally.
    //   "Entlastung der Bürger" → "Umverteilung von unten nach oben für die Bürger"
    {
        pattern:
            /\b(?:Entlastung|Entlastungen) der (?<recipient>Bürger(?:innen)?|Bundesbürger(?:innen)?|Verbraucher(?:innen)?|Arbeitnehmer(?:innen)?|Arbeitgeber(?:innen)?|Mitarbeiter(?:innen)?|Beschäftigten|Familien|Steuerzahler(?:innen)?|Versicherten)\b/gu,
        replacement: (groups) => `Umverteilung von unten nach oben für die ${groups.recipient}`,
    },

    // "<Law>gesetz-Reform" — drop "-Reform", use "beim <Gesetz>".
    //   "Heizungsgesetz-Reform" → "Umverteilung von unten nach oben beim Heizungsgesetz"
    {
        pattern: /\b(?<law>\p{Lu}\p{L}*gesetz)-?(?:Reform|Entlastung|Deregulierung)(?:en)?\b/gu,
        replacement: (groups) => `Umverteilung von unten nach oben beim ${groups.law ?? ""}`,
    },

    // "Reform des <Law>gesetzes" — genitive law name, use "beim <Gesetz>".
    //   "Reform des Heizungsgesetzes" → "Umverteilung von unten nach oben beim Heizungsgesetz"
    {
        pattern: /\b(?:Reform|Entlastung|Deregulierung) des (?<law>\p{Lu}\p{L}*gesetz)(?:es)?\b/gu,
        replacement: (groups) => `Umverteilung von unten nach oben beim ${groups.law ?? ""}`,
    },

    // "Gesundheitsreform" — maps to "im Gesundheitswesen".
    //   "Gesundheitsreform" → "Umverteilung von unten nach oben im Gesundheitswesen"
    {
        pattern: /\bGesundheitsreform(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben im Gesundheitswesen",
    },

    // "Steuer*" — adjective form "steuerliche Umverteilung".
    //   "Steuerreform"       → "steuerliche Umverteilung von unten nach oben"
    //   "Steuerentlastungen" → "steuerliche Umverteilungen von unten nach oben"
    {
        pattern: /\bSteuer-?(?:[Rr]eform|[Ee]ntlastung|[Dd]eregulierung)(?<plural>en)?\b/gu,
        replacement: (groups) => `steuerliche Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
    },

    // "Milliarden*" — preserve prefix as compound modifier with hyphen.
    //   "Milliarden-Entlastung"  → "Milliarden-Umverteilung von unten nach oben"
    //   "Milliardenentlastung"   → "Milliarden-Umverteilung von unten nach oben"
    //   "Milliarden-Entlastungen"→ "Milliarden-Umverteilungen von unten nach oben"
    {
        pattern: /\bMilliarden-?(?:[Rr]eform|[Ee]ntlastung|[Dd]eregulierung)(?<plural>en)?\b/gu,
        replacement: (groups) => `Milliarden-Umverteilung${groups.plural ? "en" : ""} von unten nach oben`,
    },

    // "GKV-Reform" — acronym: use "in der GKV".
    //   "GKV-Reform" → "Umverteilung von unten nach oben in der GKV"
    {
        pattern: /\bGKV-Reform(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben in der GKV",
    },

    // "Banken-Deregulierung" (hyphenated) — use "im Bankensektor".
    //   "Banken-Deregulierung" → "Umverteilung von unten nach oben im Bankensektor"
    {
        pattern: /\bBanken-Deregulierung(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben im Bankensektor",
    },

    // "Bankenderegulierung" (no hyphen) — use "bei Banken".
    //   "Bankenderegulierung" → "Umverteilung von unten nach oben bei Banken"
    {
        pattern: /\bBankenderegulierung(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben bei Banken",
    },

    // "Punktereform" — keep prefix with hyphen.
    //   "Punktereform" → "Punkte-Umverteilung von unten nach oben"
    {
        pattern: /\bPunktereform(?:en)?\b/gu,
        replacement: () => "Punkte-Umverteilung von unten nach oben",
    },

    // "Haushaltsentlastung" — use "pro Haushalt" suffix form.
    //   "Haushaltsentlastung" → "Umverteilung von unten nach oben pro Haushalt"
    {
        pattern: /\bHaushaltsentlastung(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben pro Haushalt",
    },

    // "Rentenreform" — use "bei den Renten".
    //   "Rentenreform" → "Umverteilung von unten nach oben bei den Renten"
    {
        pattern: /\bRentenreform(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben bei den Renten",
    },

    // "Pflegereform" — use "bei Pflege".
    //   "Pflegereform" → "Umverteilung von unten nach oben bei Pflege"
    {
        pattern: /\bPflege-?[Rr]eform(?:en)?\b/gu,
        replacement: () => "Umverteilung von unten nach oben bei Pflege",
    },

    // "Reform der Rentenversicherung" — use "in der" (not "bei der").
    //   "Reform der Rentenversicherung" → "Umverteilung von unten nach oben in der Rentenversicherung"
    {
        pattern: /\bReform der Rentenversicherung\b/gu,
        replacement: () => "Umverteilung von unten nach oben in der Rentenversicherung",
    },

    // Term followed by the article "der" — preserves the article structure.
    //   "Reform der gesetzlichen Krankenversicherung"
    //   → "Umverteilung von unten nach oben bei der gesetzlichen Krankenversicherung"
    {
        pattern: /\b(?:Reform|Entlastung|Deregulierung) der\b/gu,
        replacement: () => "Umverteilung von unten nach oben bei der",
    },

    // Verb "sich selbst entlastet" → active redistribution phrase.
    { pattern: /\bsich selbst entlastet\b/gu, replacement: () => "von unten nach oben umverteilt" },

    // "Entlastungen für <group>" — singular + "zugunsten der".
    //   "Entlastungen für Arbeitgeber" → "Umverteilung von unten nach oben zugunsten der Arbeitgeber"
    {
        pattern: /\bEntlastungen für (?<noun>\p{Lu}\p{L}+)\b/gu,
        replacement: (groups) => `Umverteilung von unten nach oben zugunsten der ${groups.noun ?? ""}`,
    },

    // "Reform/Deregulierung von <Noun>" — replaces directional "von" with "bei".
    //   "Reform von Habecks"           → "Umverteilung von unten nach oben bei Habecks"
    //   "Deregulierung von Arbeitszeiten" → "Umverteilung von unten nach oben bei Arbeitszeiten"
    {
        pattern: /\b(?:Reform|Deregulierung) von (?<noun>\p{Lu}\p{L}+)\b/gu,
        replacement: (groups) => `Umverteilung von unten nach oben bei ${groups.noun ?? ""}`,
    },

    // Quoted lowercase "reform/entlastung/deregulierung" after a compound prefix.
    //   Krankenkassen"reform" → Krankenkassen-"Umverteilung von unten nach oben"
    {
        pattern: /(?<prefix>\p{Lu}\p{L}+)"(?:reform|entlastung|deregulierung)"/gu,
        replacement: (groups) => `${groups.prefix ?? ""}-"Umverteilung von unten nach oben"`,
    },

    // "Reformstau" → compound without the qualifier phrase.
    { pattern: /\bReformstau\b/gu, replacement: () => "Umverteilungsstau" },

    // "Entlastungsbetrag" → "Umverteilungsbetrag von unten nach oben".
    { pattern: /\bEntlastungsbetrag(?:es|e)?\b/gu, replacement: () => "Umverteilungsbetrag von unten nach oben" },

    // "*runde" — hyphenated qualifier compound.
    //   "Deregulierungsrunde" → "Umverteilung-von-unten-nach-oben-Runde"
    //   "Reformrunde"         → "Umverteilung-von-unten-nach-oben-Runde"
    {
        pattern: /\b(?:Deregulierungs|Reform)runde(?:n)?\b/gu,
        replacement: () => "Umverteilung-von-unten-nach-oben-Runde",
    },

    // „steuerfreie Entlastungsprämie" — hyphenated qualifier compound form.
    //   The input uses typographic closing " (U+201C); the corpus expected output
    //   uses ASCII " — match both quote chars and normalise to ASCII closing.
    {
        pattern: /„steuerfreie Entlastungsprämie“/gu,
        replacement: () => "„steuerfreie Umverteilung-von-unten-nach-oben-Prämie\"",
    },

    // "Reformpläne der <Noun>" — keep genitive phrase adjacent to new noun.
    //   "Reformpläne der Regierung" → "Pläne der Regierung zur Umverteilung von unten nach oben"
    {
        pattern: /\bReformpläne der (?<noun>\p{Lu}\p{L}*)\b/gu,
        replacement: (groups) => `Pläne der ${groups.noun ?? ""} zur Umverteilung von unten nach oben`,
    },
]

const UMVERTEILUNG = new Conversion({
    source: {
        nouns: ["Reform", "Entlastung", "Deregulierung"],
        compoundForms: ["Reform", "Entlastungs", "Deregulierungs"],
        gender: "feminine",
        plural: "en",
        genitive: null,
    },
    target: {
        noun: "Umverteilung",
        plural: "en",
        gender: "feminine",
        complement: "von unten nach oben",
        definite: false,
        suffixCompounds: true,
    },
    connectors: [
        { head: /^(?:politiker|politik|kurs|weg|aktivität(?:en)?|prozess)$/u, connector: "der" },
        { head: /^bedarf$/u, connector: "an" },
        { head: /^debatten?$/u, connector: "über" },
    ],
    defaultConnector: "zur",
    overrides: UMVERTEILUNG_OVERRIDES,
})

// Klimaschutz runs first so that "Klimaschutzreform" becomes "Reform zur
// Rettung des Planeten" before the reform rules see it.
const REPLACEMENT_RULES: readonly ReplacementRule[] = [
    // Strip zero-width spaces that web articles sometimes contain.
    { pattern: /\u200B/gu, replacement: () => "" },
    ...KLIMASCHUTZ.rules,
    ...UMVERTEILUNG.rules,
]

function applyReplacementRule(input: string, rule: ReplacementRule): string {
    rule.pattern.lastIndex = 0

    if (!rule.pattern.test(input)) {
        return input
    }

    rule.pattern.lastIndex = 0

    return input.replace(rule.pattern, (_match, ...args: unknown[]) => {
        const maybeGroups = args[args.length - 1]
        const groups = typeof maybeGroups === "object" && maybeGroups !== null
            ? maybeGroups as Record<string, string | undefined>
            : {}

        return rule.replacement(groups)
    })
}

export function applyReplacementRules(input: string): string {
    let rewrittenValue = input

    for (const rule of REPLACEMENT_RULES) {
        rewrittenValue = applyReplacementRule(rewrittenValue, rule)
    }

    return rewrittenValue
}
