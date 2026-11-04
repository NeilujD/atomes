<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/atomes-icon-dark.svg">
    <img src="public/icons/atomes-icon.svg" alt="Atomes logo: three book spines, one missing" width="128">
  </picture>
</p>

# Atomes

A personal library tracker built on AT Protocol: what you own, what you have read, and which series have new volumes.

Start here: [docs/HANDOFF.md](docs/HANDOFF.md). Vocabulary: [GLOSSARY.md](GLOSSARY.md). Decisions: [docs/adr/](docs/adr/).

Licence: [AGPL-3.0](LICENSE). Lexicon definitions (`app.atomes.*`) are MIT, so any app can adopt them ([ADR 0006](docs/adr/0006-agpl-for-app-and-catalog-mit-for-lexicons.md)).

## Develop

Needs Node 22.23.4+ and [Bun](https://bun.sh).

```sh
bun install
bun run check   # type check
bun run test    # tests (not `bun test`)
bun run build   # Node server in dist/
bun run dev     # http://127.0.0.1:4321
bun run phone   # built app for a phone test over HTTPS
```

Test on a phone: [docs/phone-https.md](docs/phone-https.md).
