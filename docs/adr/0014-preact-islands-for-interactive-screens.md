# Preact islands for interactive data screens, plain scripts elsewhere

Status: accepted (2026-11-09)

Until now every page had one vanilla TypeScript script that kept its state in module variables and changed the DOM by hand. The screens still to build are the hardest: the Library in Grid, List and Cover flow with search, sort, filters and Labels; Shelf Check; the Series page with its spine row. They also share state (the offline indicator, the device copy, the session). Hand-written DOM updates for these grow into code that is hard to review and is not tested.

Rule:

- An **interactive data screen** (it renders a list or state that changes as the reader acts) is a Preact island (`@astrojs/preact`).
- A **simple page** (static content, one form, one button) stays Astro markup with a plain script.
- State shared by several islands lives in one small shared store. Check the store the Astro docs recommend for sharing state between islands before choosing it.
- Domain rules stay in pure TypeScript modules under `src/lib/`, tested in Node as today. Islands only render and call them.
- Islands are tested with Testing Library in a DOM test environment (happy-dom) in Vitest.
- An existing page moves to an island only when a ticket changes it, never in a bulk rewrite.

## Consequences

- Rendering stays on the device. Shelf Check offline needs rendering from the device copy, so the server-side session (ADR 0013) does not move rendering to the server.
- Two patterns live side by side; reviewers check the rule above.
- Runtime dependencies grow by `preact` and `@astrojs/preact`, and maybe the shared store.

## Considered Options

- Stay vanilla and add a render helper: rejected. The project would write and maintain its own small UI framework.
- Svelte or Solid islands: rejected. They work as well, but agents write JSX more reliably and Preact is small.
- One framework for every page, app-style: rejected. It goes against Astro's page model, and the simple pages gain nothing.
