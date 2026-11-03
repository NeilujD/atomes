# Web-only, offline-first app built with Astro

Status: accepted

The app is a website installable on the phone (PWA), built with Astro. There is no native app. Shelf Check must work in a shop with no signal, so the app keeps a local copy of the reader's Library on the device. We accepted the web platform's weaker camera and push-notification support (especially on iOS) in exchange for one codebase, no app store, and something anyone can self-host.

## Considered Options

- Native iOS/Android app: better camera and notifications, rejected because it means app stores, two platforms, and a much harder path for self-hosters.
- Next.js: rejected in favour of Astro, which the author wants to invest in.
