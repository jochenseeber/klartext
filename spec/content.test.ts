import { describe, expect, it } from "vitest"
import { applyReplacementRules, isEligibleText, readStoredBoolean } from "../src/content"

describe("isEligibleText", () => {
    it("detects political terms case-insensitively", () => {
        expect(isEligibleText("Rede von Merz zur Wirtschaft")).toBe(true)
        expect(isEligibleText("die afd diskutiert weiter")).toBe(true)
        expect(isEligibleText("Dürr und Söder im Interview")).toBe(true)
    })

    it("does not match unrelated text or partial words", () => {
        expect(isEligibleText("Ein Artikel ueber Gartenarbeit")).toBe(false)
        expect(isEligibleText("Ein spahnender Moment ohne Politik")).toBe(false)
    })
})

describe("applyReplacementRules", () => {
    it("rewrites standalone reform language", () => {
        expect(applyReplacementRules("Wir planen eine Reform.")).toBe(
            "Wir planen eine Umverteilung von unten nach oben.",
        )
        expect(applyReplacementRules("Reformen sind nötig.")).toBe(
            "Umverteilungen von unten nach oben sind nötig.",
        )
    })

    it("rewrites reform phrases before the generic reform rule", () => {
        expect(applyReplacementRules("Die Reform der Rente kommt.")).toBe(
            "Die Umverteilung von unten nach oben bei der Rente kommt.",
        )
    })

    it("rewrites compound policy terms", () => {
        expect(applyReplacementRules("Das Entlastungsgesetz ist beschlossen.")).toBe(
            "Das Gesetz zur Umverteilung von unten nach oben ist beschlossen.",
        )
        expect(applyReplacementRules("Eine Verwaltungsreform folgt.")).toBe(
            "Eine Verwaltungsumverteilung von unten nach oben folgt.",
        )
    })

    it("uses the adjective form for Strukturreform", () => {
        expect(applyReplacementRules("Eine Strukturreform ist überfällig.")).toBe(
            "Eine strukturelle Umverteilung von unten nach oben ist überfällig.",
        )
        expect(applyReplacementRules("Strukturreformen scheitern oft.")).toBe(
            "strukturelle Umverteilungen von unten nach oben scheitern oft.",
        )
    })

    it("uses 'der' for genitive-attractor compounds", () => {
        expect(applyReplacementRules("Reformpolitiker werden selten bejubelt.")).toBe(
            "Politiker der Umverteilung von unten nach oben werden selten bejubelt.",
        )
        expect(applyReplacementRules("Der Reformkurs steht fest.")).toBe(
            "Der Kurs der Umverteilung von unten nach oben steht fest.",
        )
    })

    it("uses 'an' for *bedarf compounds", () => {
        expect(applyReplacementRules("Es besteht Reformbedarf.")).toBe(
            "Es besteht Bedarf an Umverteilung von unten nach oben.",
        )
    })

    it("uses 'für die' for Entlastung der <people>", () => {
        expect(applyReplacementRules("Die Entlastung der Bürger ist überfällig.")).toBe(
            "Die Umverteilung von unten nach oben für die Bürger ist überfällig.",
        )
        // institutional object falls through to the generic "bei der" rule
        expect(applyReplacementRules("Die Entlastung der Krankenversicherung ist beschlossen.")).toBe(
            "Die Umverteilung von unten nach oben bei der Krankenversicherung ist beschlossen.",
        )
    })

    it("preserves plural in compound suffixes", () => {
        expect(applyReplacementRules("Steuerreformen kommen.")).toBe(
            "steuerliche Umverteilungen von unten nach oben kommen.",
        )
    })

    it("handles hyphenated compound suffixes", () => {
        expect(applyReplacementRules("Banken-Deregulierung verzerrt den Wettbewerb.")).toBe(
            "Umverteilung von unten nach oben im Bankensektor verzerrt den Wettbewerb.",
        )
    })

    it("leaves unrelated text unchanged", () => {
        expect(applyReplacementRules("Heute bleibt alles beim Alten.")).toBe("Heute bleibt alles beim Alten.")
    })
})

describe("readStoredBoolean", () => {
    it("uses stored booleans when present", () => {
        expect(readStoredBoolean(true, false)).toBe(true)
        expect(readStoredBoolean(false, true)).toBe(false)
    })

    it("falls back for non-boolean values", () => {
        expect(readStoredBoolean(undefined, true)).toBe(true)
        expect(readStoredBoolean("false", true)).toBe(true)
    })
})
