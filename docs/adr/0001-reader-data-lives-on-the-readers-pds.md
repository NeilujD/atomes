# The reader's data lives on their own AT Protocol PDS

Status: superseded by ADR 0016 (2026-11-13), because the Library stays on the instance and the AT Protocol account is optional

The reader's Library (Copies, Reading Statuses, Followed and Dropped Series, To Buy) is stored as AT Protocol records in the reader's own Personal Data Server, not in a database owned by the app. We chose this so the project can be open-sourced and run as a platform without ever holding people's data: a reader can leave, switch to another app that understands the same records, or self-host, and keep their Library. The book catalog (Works, Editions, Series, release dates) is shared reference data and is not user data.

## Consequences

- AT Protocol records are public by default, and the Library is Private by default, so most of it lives in non-public storage (see ADR 0003).
- The app has no user table and no sign-up: the reader signs in with an AT Protocol identity.

## Amendment 2026-11-09: Private records on the instance until Spaces

Until atproto Spaces is generally released, Private records are stored by the Atomes instance, and only Shared records live on the reader's PDS (ADR 0012). The goal of this ADR is unchanged: records keep the same lexicons and keys, the reader can export them, and they move to the reader's Space when the trigger in ADR 0012 is met. Until then, the instance does hold Private reader data.
