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

    it.each([
        ["Das Reform-Paket kommt.", "Das Paket zur Umverteilung von unten nach oben kommt."],
        ["Die Reform-Politik scheitert.", "Die Politik der Umverteilung von unten nach oben scheitert."],
        ["Die Entlastungsdebatte läuft.", "Die Debatte über Umverteilung von unten nach oben läuft."],
        ["Die Reformdebatten laufen.", "Die Debatten über Umverteilung von unten nach oben laufen."],
        ["Der Reformer spricht.", "Der Reformer spricht."],
        ["Das Reform- und Sparpaket.", "Das Reform- und Sparpaket."],
    ])("handles hyphenated and plural reform compounds: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
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

    it.each([
        ["Der Klimaschutz bleibt auf der Strecke.", "Die Rettung des Planeten bleibt auf der Strecke."],
        ["Die Kosten des Klimaschutzes steigen.", "Die Kosten der Rettung des Planeten steigen."],
        ["Das dient dem Klimaschutz.", "Das dient der Rettung des Planeten."],
        [
            "Sie hat den nationalen und internationalen Klimaschutz im Blick.",
            "Sie hat die nationale und internationale Rettung des Planeten im Blick.",
        ],
        ["Ein ehrgeiziger Klimaschutz ist möglich.", "Eine ehrgeizige Rettung des Planeten ist möglich."],
        [
            "Es gibt keinen wirksamen Klimaschutz ohne CO2-Preis.",
            "Es gibt keine wirksame Rettung des Planeten ohne CO2-Preis.",
        ],
        ["Unser Klimaschutz ist vorbildlich.", "Unsere Rettung des Planeten ist vorbildlich."],
        ["Diesen Klimaschutz will niemand.", "Diese Rettung des Planeten will niemand."],
    ])("swaps masculine determiners for feminine ones: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Merz will beim Klimaschutz sparen.", "Merz will bei der Rettung des Planeten sparen."],
        ["Er ist Vorreiter im Klimaschutz.", "Er ist Vorreiter bei der Rettung des Planeten."],
        ["Das trägt zum Klimaschutz bei.", "Das trägt zur Rettung des Planeten bei."],
    ])("expands contracted prepositions: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Es geht um Klimaschutz.", "Es geht um die Rettung des Planeten."],
        ["Das trägt zu Klimaschutz bei.", "Das trägt zur Rettung des Planeten bei."],
        [
            "Mit ambitioniertem Klimaschutz schaffen wir Jobs.",
            "Mit der ambitionierten Rettung des Planeten schaffen wir Jobs.",
        ],
        [
            "Die Grünen stehen für konsequenten Klimaschutz.",
            "Die Grünen stehen für die konsequente Rettung des Planeten.",
        ],
    ])("inserts the article a preposition governs: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Wir brauchen mehr Klimaschutz.", "Wir brauchen mehr Rettung des Planeten."],
        ["Weniger Klimaschutz heißt mehr Hitze.", "Weniger Rettung des Planeten heißt mehr Hitze."],
        ["Deutschlands Klimaschutz stockt.", "Deutschlands Rettung des Planeten stockt."],
        [
            "Beim Thema Klimaschutz streitet die Koalition.",
            "Beim Thema Rettung des Planeten streitet die Koalition.",
        ],
    ])("keeps quantifiers, genitives and appositions without article: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Klimaschutz ist Menschenschutz.", "Die Rettung des Planeten ist Menschenschutz."],
        ["Guter Klimaschutz kostet Geld.", "Die gute Rettung des Planeten kostet Geld."],
        ["„Klimaschutz ist wichtig“, sagte Merz.", "„Die Rettung des Planeten ist wichtig“, sagte Merz."],
        ["Aber Klimaschutz ist teuer.", "Aber die Rettung des Planeten ist teuer."],
        ["Wir brauchen Klimaschutz.", "Wir brauchen die Rettung des Planeten."],
        ["Wir benötigen Klimaschutz.", "Wir benötigen die Rettung des Planeten."],
        ["Sie fordern effektiven Klimaschutz.", "Sie fordern die effektive Rettung des Planeten."],
        [
            "Die Partei, der sozialen Klimaschutz fordert, verliert.",
            "Die Partei, der die soziale Rettung des Planeten fordert, verliert.",
        ],
    ])("inserts an article for bare Klimaschutz: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Das Klimaschutzgesetz wird aufgeweicht.", "Das Gesetz zur Rettung des Planeten wird aufgeweicht."],
        ["Die Klimaschutzministerin tritt zurück.", "Die Ministerin für die Rettung des Planeten tritt zurück."],
        ["Die EU-Klimaschutzziele wackeln.", "Die EU-Ziele zur Rettung des Planeten wackeln."],
        ["Die Klimaschutzdebatte eskaliert.", "Die Debatte über die Rettung des Planeten eskaliert."],
        ["Aus Klimaschutzgründen verboten.", "Aus Gründen der Rettung des Planeten verboten."],
        [
            "Die Klimaschutzreform ist gescheitert.",
            "Die Umverteilung von unten nach oben zur Rettung des Planeten ist gescheitert.",
        ],
    ])("rewrites Klimaschutz compounds: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
    })

    it.each([
        ["Klimaschutz", "Rettung des Planeten"],
        ["Klimaschutz: Regierung streicht Mittel", "Rettung des Planeten: Regierung streicht Mittel"],
        ["Klimaschutz- und Energiepolitik", "Klimaschutz- und Energiepolitik"],
    ])("handles labels and coordinated compounds: %s", (input, expected) => {
        expect(applyReplacementRules(input)).toBe(expected)
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
