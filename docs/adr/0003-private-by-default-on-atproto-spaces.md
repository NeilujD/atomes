# Private by default, stored in an atproto Space

Status: accepted

The Library is Private by default; the reader chooses what to share, by category with per-Work exceptions. Ordinary AT Protocol records are readable by anyone and are broadcast to relays, so app-level sign-in can't protect them. Private records therefore go into a one-member atproto Space on the reader's PDS. Shared records are ordinary public records using the same record types, so sharing something means moving the record. We build on Spaces while it is still alpha (opened August 2026), against Bluesky's hosted alpha PDS with test data only, because the alpha may break or wipe data. Real data, our own PDS and other readers wait for the general release.

## Consequences

- The Space uses the `com.atproto.personalspace` policy: only the reader can read it. A Space gives access control, not encryption, so the reader's PDS operator can read Private records (spike `docs/spikes/0001-oauth-and-spaces-alpha.md`).
- Cover photos sent to the server for recognition are processed and deleted immediately. They are never stored and never used for training. Barcode scanning runs on the device. The only exception is when the reader explicitly chooses to use their photo as the cover of a book the Catalog doesn't know.

## Considered Options

- Everything public, like most atproto book apps: rejected, because the reader must be able to keep their reading private.
- Encrypting records before writing them publicly: rejected. Counts and timestamps still leak, other apps can't read them, and sharing keys across devices is hard.
- Device-only storage: rejected, because the Library must sync across the reader's devices.
