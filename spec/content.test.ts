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
            "Wir planen Vorschläge zur Umverteilung von unten nach oben.",
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
            "Eine Umverteilung von unten nach oben bei Verwaltung folgt.",
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
