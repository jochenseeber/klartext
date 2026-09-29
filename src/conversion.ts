import {
    adjectiveEnding,
    adjectiveWords,
    ANCHORED_ADJECTIVES,
    anyCase,
    definiteArticle,
    Determiner,
    type Gender,
    type GrammaticalCase,
    inflectAdjectives,
    lc,
    strongAdjectiveEnding,
    strongAdjectives,
    strongCase,
    uc,
    weakAdjectiveEnding,
    withArticle,
} from "./grammar"

export type Groups = Record<string, string | undefined>

export interface ReplacementRule {
    pattern: RegExp
    replacement: (groups: Groups) => string
}

export interface CompoundConnector {
    // Tested against the lowercase head of the compound, e.g. "debatte".
    head: RegExp
    // Words between the head and the target phrase, e.g. "über die".
    connector: string
}

export interface SourceNoun {
    // Singular forms, e.g. "Reform", "Entlastung".
    nouns: readonly string[]
    // Forms that start a compound, e.g. "Reform", "Entlastungs".
    compoundForms: readonly string[]
    gender: Gender
    // Plural suffix ("en" for "Reformen"), or null if the noun has none.
    plural: string | null
    // Genitive suffix ("es" for "Klimaschutzes"), or null if it has none.
    genitive: string | null
}

export interface TargetNoun {
    noun: string
    // Plural suffix ("en" for "Umverteilungen").
    plural: string
    gender: Gender
    // Phrase after the noun, e.g. "von unten nach oben".
    complement: string
    // Whether the target needs an article where the source has none.
    // "Wir brauchen Klimaschutz" → "Wir brauchen die Rettung des Planeten".
    definite: boolean
    // Whether compounds ending in the source noun keep their first part:
    // "Rentenreform" → "Rentenumverteilung von unten nach oben".
    suffixCompounds: boolean
}

export interface ConversionDefinition {
    source: SourceNoun
    target: TargetNoun
    // Connectors for compounds starting with the source noun; the first
    // match wins, otherwise the default is used.
    connectors: readonly CompoundConnector[]
    defaultConnector: string
    // Special cases that run before the generic rules.
    overrides: readonly ReplacementRule[]
}

// Word boundaries that also work for umlauts. Hyphens count as part of the
// word so that "EU-Klimaschutz" or "Reform- und Sparpaket" stay untouched.
const START = String.raw`(?<![\p{L}\p{N}-])`
const END = String.raw`(?![\p{L}\p{N}-])`

const QUANTIFIERS = ["etwas", "genug", "kaum", "mehr", "viel", "weniger", "wenig"]
const APPOSITION_NOUNS = ["Bereich", "Politikfeld", "Ressort", "Stichwort", "Thema"]
const NON_OWNERS = ["Als", "Aus", "Besonders", "Bis", "Das", "Des", "Es", "Stets", "Was"]

const PREPOSITIONS: Readonly<Record<Exclude<GrammaticalCase, "nominative">, readonly string[]>> = {
    accusative: ["auf", "durch", "für", "gegen", "in", "ohne", "über", "um"],
    dative: ["an", "aus", "bei", "mit", "nach", "neben", "seit", "unter", "von", "vor", "zu", "zwischen"],
    genitive: ["angesichts", "anstatt", "mittels", "statt", "trotz", "wegen", "zugunsten"],
}

// Replaces one source noun with a target phrase. The generic rules run from
// specific to generic:
//
//   1. Overrides — special cases of the conversion.
//   2. Compounds starting with the source noun ("Klimaschutzgesetz").
//   3. Compounds ending in the source noun ("Rentenreform").
//   4. Determiner and adjectives in front of the noun, re-inflected for the
//      target gender ("den wirksamen Klimaschutz").
//   5. Bare nouns that need an article because the target is definite.
//   6. The noun itself, singular or plural.
//
// Steps 4 and 5 only run when the gender changes or the target is definite;
// otherwise the words around the noun stay valid as they are.
export class Conversion {
    readonly rules: readonly ReplacementRule[]

    constructor(private readonly definition: ConversionDefinition) {
        const { source, target } = definition

        // Feminine and neuter determiners are ambiguous ("der" is dative or
        // genitive), so only masculine nouns can change gender reliably.
        if (source.gender !== target.gender && source.gender !== "masculine") {
            throw new Error(`Cannot convert ${source.gender} "${source.nouns[0]}" to ${target.gender}`)
        }

        this.rules = [
            ...definition.overrides,
            this.prefixCompoundRule(),
            ...(target.suffixCompounds ? [this.suffixCompoundRule()] : []),
            ...(source.gender !== target.gender || target.definite ? [this.determinerRule()] : []),
            ...(target.definite ? this.articleRules() : []),
            this.nounRule(),
        ]
    }

    private get source(): SourceNoun {
        return this.definition.source
    }

    private get target(): TargetNoun {
        return this.definition.target
    }

    private phrase(plural = false): string {
        const noun = `${this.target.noun}${plural ? this.target.plural : ""}`
        return this.target.complement ? `${noun} ${this.target.complement}` : noun
    }

    private connector(head: string): string {
        const lower = head.toLocaleLowerCase("de-DE")
        const match = this.definition.connectors.find((connector) => connector.head.test(lower))
        return match?.connector ?? this.definition.defaultConnector
    }

    // Singular source noun, optionally in the genitive.
    private get singular(): string {
        const genitive = this.source.genitive === null ? "" : `(?<genitive>${this.source.genitive})?`
        return String.raw`(?:${this.source.nouns.join("|")})${genitive}${END}`
    }

    // "Klimaschutzgesetz"   → "Gesetz zur Rettung des Planeten"
    // "EU-Klimaschutzziele" → "EU-Ziele zur Rettung des Planeten"
    // "Reformbedarf"        → "Bedarf an Umverteilung von unten nach oben"
    private prefixCompoundRule(): ReplacementRule {
        return {
            pattern: new RegExp(
                String.raw`(?<![\p{L}\p{N}])(?<prefix>\p{Lu}[\p{L}\p{N}]*-)?(?:${
                    this.source.compoundForms.join("|")
                })-?(?<suffix>\p{L}{3,})`,
                "gu",
            ),
            replacement: (groups) => {
                const suffix = groups.suffix ?? ""
                return `${groups.prefix ?? ""}${uc(suffix)} ${this.connector(suffix)} ${this.phrase()}`
            },
        }
    }

    // Keeps the hyphen so that "XL-Reform" becomes "XL-Umverteilung" while
    // "Rentenreform" becomes "Rentenumverteilung".
    private suffixCompoundRule(): ReplacementRule {
        const plural = this.source.plural === null ? "" : `(?<plural>${this.source.plural})?`

        return {
            pattern: new RegExp(
                String.raw`(?<![\p{L}\p{N}])(?<prefix>\p{Lu}\p{L}*)(?<hyphen>-)?(?:${
                    anyCase(this.source.nouns)
                })${plural}(?![\p{L}\p{N}])`,
                "gu",
            ),
            replacement: (groups) => {
                const hyphen = groups.hyphen ?? ""
                const phrase = this.phrase(Boolean(groups.plural))
                return `${groups.prefix ?? ""}${hyphen}${hyphen ? phrase : lc(phrase)}`
            },
        }
    }

    // "den wirksamen Klimaschutz"   → "die wirksame Rettung des Planeten"
    // "ein ehrgeiziger Klimaschutz" → "eine ehrgeizige Rettung des Planeten"
    // "beim Klimaschutz"            → "bei der Rettung des Planeten"
    private determinerRule(): ReplacementRule {
        const forms = Determiner.forms(this.source.gender)
        const spellings = [...forms.keys()].sort((a, b) => b.length - a.length)

        return {
            pattern: new RegExp(
                String.raw`${START}(?<whole>(?<determiner>${
                    anyCase(spellings)
                })\s+${ANCHORED_ADJECTIVES}${this.singular})`,
                "gu",
            ),
            replacement: (groups) => {
                const spelling = groups.determiner ?? ""
                const determiner = forms.get(lc(spelling))
                const adjectives = groups.adjectives ?? ""

                // Adjectives that do not agree with the determiner mean it is
                // not part of the noun phrase, as with the relative pronoun in
                // "…, der sozialen Klimaschutz fordert".
                const sourceEnding = determiner?.adjectiveEnding(this.source.gender)
                const agrees = adjectiveWords(adjectives).every((word) => adjectiveEnding(word) === sourceEnding)

                if (determiner === undefined || !agrees) {
                    return groups.whole ?? ""
                }

                const rendered = determiner.render(this.target.gender)
                const inflected = inflectAdjectives(adjectives, determiner.adjectiveEnding(this.target.gender))
                return `${spelling === lc(spelling) ? rendered : uc(rendered)} ${inflected}${this.phrase()}`
            },
        }
    }

    private articleRules(): ReplacementRule[] {
        return [
            this.ownerRule(),
            this.prepositionRule(),
            this.labelRule(),
            this.sentenceStartRule(),
            this.bareRule(),
        ]
    }

    // Quantifier, Saxon genitive or apposition — no article is inserted,
    // adjectives take strong endings.
    // "mehr Klimaschutz"      → "mehr Rettung des Planeten"
    // "Deutschlands Klimaschutz" → "Deutschlands Rettung des Planeten"
    // "beim Thema Klimaschutz" → "beim Thema Rettung des Planeten"
    private ownerRule(): ReplacementRule {
        return {
            pattern: new RegExp(
                String.raw`${START}(?<owner>${anyCase(QUANTIFIERS)}|${APPOSITION_NOUNS.join("|")}|(?!(?:${
                    NON_OWNERS.join("|")
                })\s)\p{Lu}\p{L}*(?:s|['’]))\s+${ANCHORED_ADJECTIVES}${this.singular}`,
                "gu",
            ),
            replacement: (groups) => {
                const adjectives = groups.adjectives ?? ""
                const grammaticalCase = strongCase(
                    adjectives,
                    this.source.gender,
                    Boolean(groups.genitive),
                    "accusative",
                )
                const ending = strongAdjectiveEnding(this.target.gender, grammaticalCase)
                return `${groups.owner ?? ""} ${inflectAdjectives(adjectives, ending)}${this.phrase()}`
            },
        }
    }

    // Preposition without article — insert the article it governs.
    // "für Klimaschutz"                → "für die Rettung des Planeten"
    // "mit ambitioniertem Klimaschutz" → "mit der ambitionierten Rettung des Planeten"
    // "zu Klimaschutz"                 → "zur Rettung des Planeten"
    private prepositionRule(): ReplacementRule {
        const cases = Object.keys(PREPOSITIONS) as Array<keyof typeof PREPOSITIONS>
        const alternatives = cases.map((grammaticalCase) =>
            `(?<${grammaticalCase}Preposition>${anyCase(PREPOSITIONS[grammaticalCase])})`
        )

        return {
            pattern: new RegExp(
                String.raw`${START}(?:${alternatives.join("|")})\s+${ANCHORED_ADJECTIVES}${this.singular}`,
                "gu",
            ),
            replacement: (groups) => {
                const grammaticalCase = cases.find((key) => groups[`${key}Preposition`]) ?? "accusative"
                const article = definiteArticle(this.target.gender, grammaticalCase)
                const ending = weakAdjectiveEnding(this.target.gender, grammaticalCase)
                const preposition = withArticle(groups[`${grammaticalCase}Preposition`] ?? "", article)
                return `${preposition} ${inflectAdjectives(groups.adjectives ?? "", ending)}${this.phrase()}`
            },
        }
    }

    // Heading or label that consists of the bare noun — keep it bare.
    // "Klimaschutz: Merz …" → "Rettung des Planeten: Merz …"
    private labelRule(): ReplacementRule {
        return {
            pattern: new RegExp(String.raw`(?<=^\s*)(?:${this.source.nouns.join("|")})(?=\s*(?::|$))`, "gu"),
            replacement: () => this.phrase(),
        }
    }

    // "Klimaschutz ist teuer."        → "Die Rettung des Planeten ist teuer."
    // "Guter Klimaschutz kostet Geld." → "Die gute Rettung des Planeten kostet Geld."
    private sentenceStartRule(): ReplacementRule {
        return {
            pattern: new RegExp(
                String.raw`(?<=(?:^|[.!?]\s+)[„"»(]?)${strongAdjectives(String.raw`\p{Lu}`)}${this.singular}`,
                "gu",
            ),
            replacement: (groups) => {
                const adjectives = lc(groups.adjectives ?? "")
                return uc(this.withInsertedArticle(adjectives, Boolean(groups.genitive), "nominative"))
            },
        }
    }

    // "Wir brauchen Klimaschutz."           → "Wir brauchen die Rettung des Planeten."
    // "Sie fordern effektiven Klimaschutz." → "Sie fordern die effektive Rettung des Planeten."
    private bareRule(): ReplacementRule {
        return {
            pattern: new RegExp(String.raw`${START}${strongAdjectives(String.raw`\p{Ll}`)}${this.singular}`, "gu"),
            replacement: (groups) =>
                this.withInsertedArticle(groups.adjectives ?? "", Boolean(groups.genitive), "accusative"),
        }
    }

    private withInsertedArticle(adjectives: string, genitive: boolean, fallback: GrammaticalCase): string {
        const grammaticalCase = strongCase(adjectives, this.source.gender, genitive, fallback)
        const article = definiteArticle(this.target.gender, grammaticalCase)
        const ending = weakAdjectiveEnding(this.target.gender, grammaticalCase)
        return `${article} ${inflectAdjectives(adjectives, ending)}${this.phrase()}`
    }

    // "Reform"   → "Umverteilung von unten nach oben"
    // "Reformen" → "Umverteilungen von unten nach oben"
    private nounRule(): ReplacementRule {
        const plural = this.source.plural === null ? "" : `(?<plural>${this.source.plural})?`

        return {
            pattern: new RegExp(String.raw`${START}(?:${this.source.nouns.join("|")})${plural}${END}`, "gu"),
            replacement: (groups) => this.phrase(Boolean(groups.plural)),
        }
    }
}
