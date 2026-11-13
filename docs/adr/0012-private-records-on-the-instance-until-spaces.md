# Private records live on the Atomes instance until atproto Spaces is released

Status: accepted (2026-11-09). Amends ADR 0001; defers ADR 0003. Amended by ADR 0016 (2026-11-13).

Real use must not wait for atproto Spaces, which is still alpha and may break or wipe data (ADR 0003). Until Spaces is generally released, the reader's **Private** records are stored by the Atomes instance that the reader signs in to, in its own SQLite file. **Shared** records stay ordinary public records on the reader's PDS, as ADR 0003 says. Both use the same lexicons and record keys (ADR 0010), so a record does not change shape when it moves between the instance, the PDS and, later, a Space.

## The store

- One file, `${DATA_DIR}/library.sqlite`, separate from the Catalog (ADR 0007 amendment).
- One generic table that mirrors atproto: reader DID, collection, record key, record value (JSON), `rev`, update time, deleted flag. No table per record type: the server never queries inside records, because everything the app computes is computed on the device (ADR 0010, "Computed, never stored").
- The server validates every write against its lexicon with `@atproto/lexicon`, the same check the device runs. It stores and validates; it never computes and never copies Catalog data into records.
- Sync: the device asks for the records changed since the last `rev` it has. A delete leaves a tombstone so that other devices learn of it. A write may carry the `rev` it was based on; the server refuses it when the record has changed since, so two devices do not overwrite each other silently. Old tombstones are purged; a device whose `rev` is older than the purge lists everything again.
- The device keeps its local copy and ordered write queue (ADR 0002); the queue sends to the instance, not to the PDS.

## What changes in the promise

- The instance now knows who owns and reads what. Its operator can read Private records, as a PDS operator can read a Space (ADR 0003). Self-hosting the instance is the mitigation, as self-hosting the PDS was.
- The instance never logs record contents and never sends them to the Catalog or to a book source. The Catalog stays anonymous: it still learns only ISBNs, and Series titles and publishers for fills (ADR 0010).
- The instance operator is the data controller for these records. Before any reader other than the owner signs in, the instance gives a privacy notice, an export of all the reader's records (lexicon JSON, which any atproto app can read) and a delete of all of them.

## Moving to Spaces

Trigger: Spaces is generally released on the PDSes readers use, and the PDS can refuse a stale write (the alpha has no `swapRecord`). Then, for each reader, the app copies every record into the reader's Space and deletes it from the instance once the copy is confirmed. Because shapes and keys are the same, the move is a copy, not a conversion. Until the trigger, the app makes no Space calls, so the `@atproto/*` packages go back to stable releases instead of one pinned alpha build.

## Consequences

- Backups of `library.sqlite` are required before the first real record (ADR 0011 amendment).
- Sign-in moves to the server (ADR 0013), because the server must know which reader calls it.
- History is modelled as records, never as old row versions: a past row version exists only on the instance and would be lost at the move to Spaces (see the `loan` record, ADR 0010 amendment).

## Considered Options

- Wait for Spaces (ADR 0003 as written): rejected, because no date is known and the owner cannot use the app on real books until then.
- Drop atproto: rejected. atproto still gives sign-in with no passwords, Shared records that other apps can read, and a record format that makes the move to Spaces a copy.
- Encrypt records on the instance so that it cannot read them: rejected, for the reason ADR 0003 rejected encryption: sharing keys across the reader's devices is hard.
- One table per record type: rejected. Each lexicon change would need a DB migration, the move to Spaces would need mapping code, and the server needs no queries inside records.
- Keep old row versions as history: rejected, see Consequences.

## Amendment 2026-11-13: the instance is the permanent store

ADR 0016 drops "Moving to Spaces": there is no trigger any more, and the records stay in `library.sqlite`. The owner key of the store becomes the Account ID instead of the reader DID, and the file gets versioned migration steps. The store, the sync and the promise above are unchanged. History is still modelled as records, because the export must hold it.
