// German noun phrase grammar used to swap a source noun for a target noun of
// a different gender: "den wirksamen Klimaschutz" → "die wirksame Rettung".

export type Gender = "masculine" | "feminine" | "neuter"
export type GrammaticalCase = "nominative" | "accusative" | "dative" | "genitive"
export type Declension = Readonly<Record<GrammaticalCase, string>>

export const CASES: readonly GrammaticalCase[] = ["nominative", "accusative", "dative", "genitive"]

function declension(nominative: string, accusative: string, dative: string, genitive: string): Declension {
    return { nominative, accusative, dative, genitive }
}

const DEFINITE_ARTICLES: Readonly<Record<Gender, Declension>> = {
    masculine: declension("der", "den", "dem", "des"),
    feminine: declension("die", "die", "der", "der"),
    neuter: declension("das", "das", "dem", "des"),
}

// Endings of "ein", "kein", "unser", … and of "dieser", "jeder", ….
const EIN_WORD_ENDINGS: Readonly<Record<Gender, Declension>> = {
    masculine: declension("", "en", "em", "es"),
    feminine: declension("e", "e", "er", "er"),
    neuter: declension("", "", "em", "es"),
}

const DER_WORD_ENDINGS: Readonly<Record<Gender, Declension>> = {
    masculine: declension("er", "en", "em", "es"),
    feminine: declension("e", "e", "er", "er"),
    neuter: declension("es", "es", "em", "es"),
}

// Attributive adjective endings after a definite article or der-word (weak),
// after an ein-word (mixed), and without determiner (strong).
const WEAK_ADJECTIVE_ENDINGS: Readonly<Record<Gender, Declension>> = {
    masculine: declension("e", "en", "en", "en"),
    feminine: declension("e", "e", "en", "en"),
    neuter: declension("e", "e", "en", "en"),
}

const MIXED_ADJECTIVE_ENDINGS: Readonly<Record<Gender, Declension>> = {
    masculine: declension("er", "en", "en", "en"),
    feminine: declension("e", "e", "en", "en"),
    neuter: declension("es", "es", "en", "en"),
}

const STRONG_ADJECTIVE_ENDINGS: Readonly<Record<Gender, Declension>> = {
    masculine: declension("er", "en", "em", "en"),
    feminine: declension("e", "e", "er", "er"),
    neuter: declension("es", "es", "em", "en"),
}

const EIN_WORD_STEMS = ["dein", "ein", "euer", "ihr", "irgendein", "kein", "mein", "sein", "unser"]
const DER_WORD_STEMS = ["dies", "jed", "jen", "manch", "solch", "welch"]

const CONTRACTIONS: Readonly<Record<string, string>> = {
    "an dem": "am",
    "bei dem": "beim",
    "in dem": "im",
    "von dem": "vom",
    "zu dem": "zum",
    "zu der": "zur",
}

// "Vorreiter im Klimaschutz" reads better as "bei der Rettung des Planeten".
const PREPOSITION_OVERRIDES: Readonly<Record<string, string>> = {
    im: "bei",
}

export function uc(value: string): string {
    if (!value) {
        return value
    }

    const [firstCharacter, ...rest] = Array.from(value)
    return `${firstCharacter.toLocaleUpperCase("de-DE")}${rest.join("")}`
}

export function lc(value: string): string {
    if (!value) {
        return value
    }

    const [firstCharacter, ...rest] = Array.from(value)
    return `${firstCharacter.toLocaleLowerCase("de-DE")}${rest.join("")}`
}

function isCapitalized(value: string): boolean {
    return value !== lc(value)
}

// Regex alternation that matches each word in lower case or capitalized.
export function anyCase(words: readonly string[]): string {
    return words.map((word) => `[${uc(word[0])}${lc(word[0])}]${word.slice(1)}`).join("|")
}

// "euer" drops its second "e" before an ending: "euren", "eure".
function einWordForm(stem: string, ending: string): string {
    return stem === "euer" && ending ? `eur${ending}` : `${stem}${ending}`
}

// Joins a preposition and an article, contracting where German does.
export function withArticle(preposition: string, article: string): string {
    const phrase = `${lc(preposition)} ${article}`
    const joined = CONTRACTIONS[phrase] ?? phrase
    return isCapitalized(preposition) ? uc(joined) : joined
}

export function definiteArticle(gender: Gender, grammaticalCase: GrammaticalCase): string {
    return DEFINITE_ARTICLES[gender][grammaticalCase]
}

export function strongAdjectiveEnding(gender: Gender, grammaticalCase: GrammaticalCase): string {
    return STRONG_ADJECTIVE_ENDINGS[gender][grammaticalCase]
}

export function weakAdjectiveEnding(gender: Gender, grammaticalCase: GrammaticalCase): string {
    return WEAK_ADJECTIVE_ENDINGS[gender][grammaticalCase]
}

// A determiner in front of a singular noun, e.g. "beim", "einen", "dieses".
export class Determiner {
    constructor(
        readonly kind: "definite" | "ein-word" | "der-word",
        readonly stem: string,
        readonly grammaticalCase: GrammaticalCase,
        readonly preposition: string | null,
    ) {}

    // All determiner forms for a gender, keyed by their lowercase spelling.
    // Where forms coincide ("die" is nominative and accusative) the first case
    // wins, which is exact for masculine nouns.
    static forms(gender: Gender): ReadonlyMap<string, Determiner> {
        const forms = new Map<string, Determiner>()

        for (const grammaticalCase of CASES) {
            const article = DEFINITE_ARTICLES[gender][grammaticalCase]

            if (!forms.has(article)) {
                forms.set(article, new Determiner("definite", "", grammaticalCase, null))
            }

            for (const stem of EIN_WORD_STEMS) {
                const form = einWordForm(stem, EIN_WORD_ENDINGS[gender][grammaticalCase])

                if (!forms.has(form)) {
                    forms.set(form, new Determiner("ein-word", stem, grammaticalCase, null))
                }
            }

            for (const stem of DER_WORD_STEMS) {
                const form = `${stem}${DER_WORD_ENDINGS[gender][grammaticalCase]}`

                if (!forms.has(form)) {
                    forms.set(form, new Determiner("der-word", stem, grammaticalCase, null))
                }
            }
        }

        for (const [phrase, contraction] of Object.entries(CONTRACTIONS)) {
            const [preposition, article] = phrase.split(" ")

            if (article === DEFINITE_ARTICLES[gender].dative) {
                const target = PREPOSITION_OVERRIDES[contraction] ?? preposition
                forms.set(contraction, new Determiner("definite", "", "dative", target))
            }
        }

        return forms
    }

    // The same determiner for a noun of another gender, in the same case.
    render(gender: Gender): string {
        switch (this.kind) {
            case "definite": {
                const article = DEFINITE_ARTICLES[gender][this.grammaticalCase]
                return this.preposition === null ? article : withArticle(this.preposition, article)
            }

            case "ein-word":
                return einWordForm(this.stem, EIN_WORD_ENDINGS[gender][this.grammaticalCase])
            case "der-word":
                return `${this.stem}${DER_WORD_ENDINGS[gender][this.grammaticalCase]}`
        }
    }

    adjectiveEnding(gender: Gender): string {
        const endings = this.kind === "ein-word" ? MIXED_ADJECTIVE_ENDINGS : WEAK_ADJECTIVE_ENDINGS
        return endings[gender][this.grammaticalCase]
    }
}

// Uninflected words that may sit between a determiner and the noun.
export const NP_FILLERS: ReadonlySet<string> = new Set([
    "aber",
    "besonders",
    "deutlich",
    "eher",
    "ganz",
    "immer",
    "mehr",
    "möglichst",
    "noch",
    "oder",
    "sehr",
    "so",
    "sowie",
    "und",
    "viel",
    "weiter",
    "weniger",
    "wieder",
    "wirklich",
    "zu",
])

// Adjectives after an anchor word (determiner, preposition, quantifier).
export const ANCHORED_ADJECTIVES = String.raw`(?<adjectives>(?:(?:${
    [...NP_FILLERS].join("|")
}|\p{Ll}[\p{L}-]*(?:e|en|er|em|es)),?\s+){0,4})`

// Without an anchor, a lowercase word ending in "-en" may just as well be a
// verb ("Wir brauchen Klimaschutz"), so only typical adjective stems count.
// Endings "-er" and "-em" are adjectives unless listed as non-adjectives.
const STRONG_ADJECTIVE_STEMS = [
    "al",
    "ant",
    "bar",
    "deutsch",
    "echt",
    "end",
    "ent",
    "ernst",
    "gerecht",
    "groß",
    "gut",
    "haft",
    "hart",
    "iell",
    "iert",
    "ig",
    "isch",
    "iv",
    "klug",
    "lich",
    "los",
    "neu",
    "rasch",
    "schnell",
    "stark",
    "streng",
    "uell",
].join("|")

const NON_ADJECTIVES = `${
    anyCase([
        "aber",
        "außer",
        "besser",
        "der",
        "entweder",
        "euer",
        "früher",
        "hier",
        "hinter",
        "immer",
        "jeder",
        "leider",
        "lieber",
        "nieder",
        "oder",
        "schneller",
        "sicher",
        "später",
        "unter",
        "weder",
        "weiter",
        "wem",
        "wer",
        "wieder",
    ])
}|${String.raw`\p{L}*(?:dem|her)`}`

// Verbs such as "benötigen" or "berücksichtigen" look like "-ig" adjectives.
const IG_VERB_PREFIXES = anyCase(["an", "be", "ent", "er", "ge", "ver", "zer"])

function strongAdjective(initial: string): string {
    return [
        String.raw`(?!(?:${NON_ADJECTIVES})[,\s])`,
        String.raw`(?!(?:${IG_VERB_PREFIXES})\p{L}*igen[,\s])`,
        String.raw`${initial}[\p{Ll}-]*(?:er|em|(?:${STRONG_ADJECTIVE_STEMS})en)`,
    ].join("")
}

// Adjectives in front of a noun without determiner. The first one may be
// capitalized at the start of a sentence.
export function strongAdjectives(initial: string): string {
    return String.raw`(?<adjectives>(?:${strongAdjective(initial)},?\s+)?(?:${
        strongAdjective(String.raw`\p{Ll}`)
    },?\s+){0,2})`
}

export function adjectiveWords(adjectives: string): string[] {
    return adjectives.split(/[,\s]+/u).filter((word) => word && !NP_FILLERS.has(word))
}

export function adjectiveEnding(word: string): string | null {
    return /(?:en|em|er|es|e)$/u.exec(word)?.[0] ?? null
}

export function inflectAdjectives(adjectives: string, ending: string): string {
    return adjectives.replace(
        /\p{L}[\p{L}-]*/gu,
        (word) => NP_FILLERS.has(word) ? word : word.replace(/(?:en|em|er|es|e)$/u, ending),
    )
}

// Case of a noun phrase without determiner, read from its strong adjective
// endings. Nominative and accusative are indistinguishable without syntax,
// so the caller supplies the fallback.
export function strongCase(
    adjectives: string,
    gender: Gender,
    genitive: boolean,
    fallback: GrammaticalCase,
): GrammaticalCase {
    if (genitive) {
        return "genitive"
    }

    const endings = adjectiveWords(adjectives).map(adjectiveEnding)

    return endings.includes(STRONG_ADJECTIVE_ENDINGS[gender].dative) ? "dative" : fallback
}
