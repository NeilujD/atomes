# UI text in French and English, from a typed dictionary

Status: accepted (2026-11-09)

The UI was English with its text written in the code. The first readers are French, and the Catalog's main sources (BnF, SUDOC) describe French books. Most screens are not built yet, so this is the cheapest moment to take the text out of the code.

- Every UI string comes from a typed dictionary in TypeScript: one object per language (French, English), read through one `t(key)` function. A key missing from a language is a type error. No i18n library.
- The language is the browser's (`navigator.language`), with an override in Settings, Appearance. French and English are supported; any other language falls back to English.
- Dates, numbers and sorting use `Intl` with the UI language. Whether sorting ignores leading articles ("Les", "La", "The") is still open (`docs/HANDOFF.md`); if it does, the list of articles is per language.
- Domain words stay English in code, tickets and `GLOSSARY.md`. The glossary gives the French UI word for each term, so a term reads the same on every screen.
- The existing strings move to the dictionary in one pull request, before the islands of ADR 0014 are built.

## Considered Options

- English only, translation later: rejected, because text written into every new screen makes the later move expensive, and the first readers are French.
- French only: rejected, because the project is open source and self-hosters may not read French.
- An i18n library: rejected for now. A typed object covers two languages with no runtime dependency.
