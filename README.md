# Klartext

Klartext is a TypeScript-based Manifest V3 browser extension. It scans loaded
pages for the words `Reform`, `Entlastung`, and `Deregulierung` and replaces
them with `Umverteilung von unten nach oben`.

It also rewrites simple affix compounds around those keywords
case-insensitively, for example `Steuerreform`, `Reformpaket`, `Steuer-Reform`,
and `Reform-Paket`.

It also replaces `Klimaschutz` with `Rettung des Planeten`. Because the new
noun is feminine, articles and adjective endings are adjusted, for example
`den wirksamen Klimaschutz` becomes `die wirksame Rettung des Planeten`.
Compounds are split up, so `Klimaschutzgesetz` becomes
`Gesetz zur Rettung des Planeten`.

The replacement only runs on pages that mention `CDU`, `CSU`, `SPD`, `FDP`,
`AfD`, or a curated list of leading politicians from those parties.

The extension injects a small status bar into each page so the replacement
behavior can be turned off and on without opening the extension UI.

## Development

This project uses `pnpm`.

```bash
pnpm install
pnpm typecheck
pnpm build
```

The build output is written to `dist/`.

For local development with rebuilds:

```bash
pnpm dev
```

## Editor Setup

The workspace includes a `.project.yaml` profile for `vsrun`.

```bash
vsrun --config --dry-run
vsrun --config
```

This applies the shared workspace profile facets used by this project,
including the base editor defaults, web tooling, and YAML support.

## Load The Extension

1. Open `chrome://extensions` in a Chromium-based browser.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select the `dist/` directory from this project.

## Project Structure

- `src/content.ts`: content script that rewrites text nodes, watches DOM
  changes, and manages the on-page toggle.
- `src/conversions.ts`: the conversions (`Klimaschutz`, `Reform`/`Entlastung`/
  `Deregulierung`), each defined by source noun, target phrase, compound
  connectors, and special-case overrides.
- `src/conversion.ts`: builds the ordered replacement rules for a conversion.
- `src/grammar.ts`: German declension tables used to re-inflect determiners and
  adjectives when the target noun has a different gender.
- `static/manifest.json`: extension manifest copied into the build output.
- `scripts/build.mjs`: esbuild-based bundler for the content script.

## Notes

- The replacement is applied only to visible text nodes, not script, style, or
  textarea contents.
- Project-local spell-check dictionaries are configured in `cspell.yaml` for
  extension-specific German and English terms.
- Political page detection currently matches the party names `CDU`, `CSU`,
  `SPD`, `FDP`, and `AfD` plus a fixed list of politician surnames including
  `Merz`, `Spahn`, `Reiche`, `Linnemann`, `Söder`, `Dobrindt`, `Klingbeil`,
  `Esken`, `Scholz`, `Pistorius`, `Faeser`, `Lindner`, `Kubicki`, or `Dürr`,
  `Strack-Zimmermann`, `Weidel`, `Chrupalla`, or `Höcke`.
- Turning the extension off restores the original text for nodes that were
  changed on the current page.
