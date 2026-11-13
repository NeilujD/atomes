# A reader has an Atomes Account; the AT Protocol account is optional

Status: accepted (2026-11-13). Supersedes ADR 0001. Amends ADR 0003, ADR 0011, ADR 0012 and ADR 0013. Not built yet: milestone "M9 · Accounts". Until then the code follows ADR 0013 with the DID allow-list.

Atomes must serve readers who are not technical. A code audit on 2026-11-13 showed what the PDS does today: it is the only way to sign in, and it receives an optional public copy of the **Shared** records. Every record already lives on the instance (ADR 0012), nothing is read back from a PDS, and a person with no AT Protocol account, or whose DID is not on the allow-list, cannot enter. So the requirement costs the target reader an account they do not have and gives them nothing. Decision: the instance is the permanent home of the Library, a reader signs in to an Atomes **Account**, and an **AT Protocol Account** is an optional link that gives a second way to sign in and the right to share.

## The Library stays on the instance

- The move to Spaces (ADR 0012, "Moving to Spaces") is dropped. `library.sqlite` is the source of truth with no end date. The unused Space store (`src/lib/space/space.ts`, its fake and the Space lexicon) is deleted; the device copy and write queue in the same folder stay.
- The reader owns their data through an export of every record in one file (lexicon JSON) and a delete of the Account, both in Settings (CORE-55). Records keep the lexicons and keys of ADR 0010, so any atproto app can still read the export.
- Shared records stay ordinary public records on the reader's PDS (ADR 0003), written by the server (ADR 0013). Only an Account with a linked AT Protocol Account can share.
- Reading other readers' records is not a goal of this phase (ADR 0008 is unchanged).

## Accounts

- A random Account ID replaces the reader DID as the owner key: in every table of `library.sqlite`, in the browser session and in the device copy.
- An email address and a DID are identities of an Account. An Account has at most one of each, and an identity belongs to one Account only.
- The Account and identity tables live in `library.sqlite`, because it is backed up and `auth.sqlite` is not. `auth.sqlite` keeps sessions and Sign-in Codes, so losing it still only signs readers out. The OAuth session stays keyed by DID.
- A reader links a second identity from Settings only, and must prove it: a Sign-in Code for an email address, the OAuth flow for an AT Protocol Account. Two Accounts are never merged; an identity that already belongs to another Account is refused.
- `library.sqlite` and `auth.sqlite` get versioned migration steps, with the pattern of the Catalog (`src/lib/catalog/migrations.ts`). The steps run once at start, before any store opens. One step makes an Account for each DID that owns records and moves the records to it. It has no reverse: back up first.
- The device moves its copy and its write queue from the DID key to the Account key once, when the server first answers with the Account. A device that starts offline with the old saved account keeps the old key until then, so no unsent write is lost.

## Sign-in

- **Email address and Sign-in Code** is the first method, shown first. The code has 6 digits, lasts 10 minutes, works once and allows 5 attempts. It is stored as a hash. The limits per address and per IP are stored in SQLite, so a restart does not reset them. There is no password.
- Sign-in and sign-up are one flow, so the answer never tells whether an address has an Account.
- **AT Protocol sign-in** (ADR 0013) is the second method, shown below as "Bluesky or another AT Protocol account". The words PDS, DID and handle leave the text shown to the reader.
- The flow is written by hand in the instance's own tables. The session cookie of ADR 0013 is unchanged.
- The server sends the code through SMTP (Nodemailer), so the sender is one setting. First sender: Scaleway Transactional Email (in the EU, no daily limit); second choice: Brevo. The sender is a data processor and is named in the privacy notice.
- **Who may sign up**: one setting, `SIGN_UP=invite|open`, replaces `ALLOWED_DIDS`. In `invite` mode a new Account needs an **Invite**, a link that works once and that the owner makes with a script. `open` comes later, with quotas and abuse limits. A self-hosted instance stays on `invite`.

## Consequences

- The instance now stores an email address. The privacy notice, the export and the delete (CORE-55) are required before the first invited reader, as ADR 0012 already said.
- ADR 0001 said the app has no user table and no sign-up. It now has both: two small tables in the SQLite file that exists (ADR 0007), and no new service except the email sender.
- The operator of the instance can still read every Library (ADR 0012). Self-hosting stays the answer for a reader who does not accept that.
- Production sign-in is no longer limited by a DID allow-list (ADR 0011, ADR 0013): the Invite does that work.

## Considered Options

- Keep the AT Protocol account required, with "Sign in with Bluesky" and a link to create one: rejected. A reader who does not want a Bluesky account stays out, and the account gives them nothing while the Library lives on the instance.
- Keep the goal of ADR 0001 and wait for Spaces: rejected. Spaces has no release date, and the target reader has no PDS.
- Drop atproto: rejected. The sign-in exists and is tested, sharing needs it, and keeping it as an option costs nothing new.
- Keep the DID column and invent an identifier for email Accounts: rejected. A false DID would stay in every table and on every device.
- Give existing Accounts their DID text as ID, to skip the device move: rejected. The ID would look like a DID for good; the device move is small and can be deleted later.
- A sign-in link in the email: rejected. On iOS the link opens the browser, which shares no cookie with the app on the home screen.
- A code of 8 digits: rejected. 6 digits are easier to type on a phone; the attempt limit carries the security.
- Passkeys, or sign-in with Google or Apple: not now. A passkey can be added later as one more identity.
- An auth library (Better Auth): rejected. It owns its user and session tables, and the code flow is small.
- An email server on the Coolify host: rejected as first sender. Delivery from a new VPS address is not reliable, and a late code blocks sign-in. SMTP keeps this option open.
