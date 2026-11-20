# An Admin role and an admin panel, with pseudonymous monitoring

Status: accepted (2026-11-20). Amends ADR 0013 and ADR 0016. Built in milestone "M13 · Admin panel". Research: spike 0006 (`docs/spikes/0006-admin-panel-roles-and-permission-libraries.md`).

The operator of an instance manages Accounts from a shell today: `scripts/invite.ts` prints one Invite for each run, nothing adds an Account with no Invite, only the reader can delete their Account, and nothing shows how the Accounts use the instance. The code has no role: every signed-in Account is a reader, and the operator's power is shell access. Decision (grilling of 2026-11-20, Q1 to Q20): **an Account can hold the Admin role, and an Admin manages Invites and Accounts in an admin panel at `/admin` that shows each Account by a reference, never by its identity.**

## Decisions

**The role is a row, and the check is our code.** A table `account_role (account, role, granted_by, granted_at)` in `library.sqlite` holds the grants; `admin` is the only role. One typed function, `can(roles, permission)`, answers every check from a fixed list of permissions. The server reads the role from the table on each admin request, so a revoke works at once. No permission library: every in-process library only evaluates rules that we give it, and none stores roles in `node:sqlite` (spike 0006). `@casl/ability` goes behind `can()` the day a rule needs a condition on a record or a field.

**The first Admin comes from a script.** `scripts/role.ts grant|revoke|list <email address or DID>` runs with `bun` on a laptop and with `node` in the app Terminal, as `scripts/invite.ts` does. It grants the role to an Account that exists; it makes no Account. No setting names an Admin. In the panel, an Admin grants the role to another Account by its email address and revokes it. The panel refuses to revoke the Admin's own role, so the panel cannot remove the last Admin; the script can.

**The panel is checked on the server.** Every other screen is gated in the browser, because the service worker keeps app screens (ADR 0013, amendment 2026-11-12). Each admin page and each admin API route reads the session and the role on the server, and answers 404 to a visitor with no session and to an Account with no role, so the panel does not show that it exists. The check is in each route, never a path test in the middleware (spike 0006, Astro docs). Admin answers are `no-store`, and the service worker keeps no admin page and no admin answer. Writes keep the `Origin` check of ADR 0013. Settings shows a link to the panel only to an Admin.

**An Admin makes Invites with no limit.** One action makes 1 to 50 Invites, each for 14 days, with an optional label. The links show once: the instance keeps only the hash of a token (ADR 0016). An Invite keeps its origin (reader, Admin or script), so the limit of one invited Account for each reader counts reader Invites only. The panel lists every Invite with its state (open, used, expired) and an Admin can revoke an open Invite of an Admin or of the script. The app sends no mail for an Invite. `scripts/invite.ts` stays.

**An Admin adds an Account by its email address.** The Account exists at once, with that address as its identity and no Invite. The app sends one mail, in the language the Admin selects (English or French): an Admin of this instance made an Account for you, open the link, sign in with this address and a Sign-in Code. The link is the plain sign-in page and holds no token, so the Sign-in Code stays the only proof of the address. The mail gives the operator's contact and says how to ask for the delete. When the address already has an Account, the panel says so, sends no mail and changes nothing. The Account keeps that an Admin added it.

**An Admin deletes an Account, with the delete the reader has.** It runs the sequence of "Delete my account" (ADR 0016): the Shared records on the PDS, the Library, the sessions, the open Invites, the identities and the Account. The Admin types the Account Reference to confirm. The dialog shows the Account that this Account invited; the delete does not touch it. The panel refuses the Admin's own Account (Settings does that) and the Account of an Admin (revoke the role first). No suspend and no block of an address: a deleted person needs a new Invite to come back.

**Monitoring is pseudonymous, and identity is a logged action.** Full anonymity is not possible: with tens of Accounts a count of 1 is one person, and pseudonymised data stays personal data (GDPR recital 26 and article 4(5); spike 0006). The panel shows each Account by its **Account Reference**, a short stable code made from a hash of the Account ID, with these facts and no other:

- the sign-up day and the last active day;
- how it started (Admin Invite and its label, reader Invite and the Account Reference of its maker, added by an Admin, or script);
- the sign-in ways (email address, AT Protocol Account, or both);
- the number of records and the records changed in the last 7 days;
- the Invites made and used, the number of Series Corrections, the number of open sessions.

The panel never shows an email address, a handle or what a Library holds, and the server still reads inside no record to make these numbers (ADR 0012). An Admin can delete an Account from its Account Reference and never learn who it is. "Show identity" shows the email address and the handle of one Account for one page view, after the Admin types a reason. "Find by email address" gives the Account Reference of an address the same way. Both go to the Admin Log. The Admins part shows the identity of each Admin: an Admin is not pseudonymous to the other Admins.

**One new fact is stored: the last active day.** The Account keeps the last calendar day (UTC) on which the server saw a request of its session, written once a day at most. No IP address, no request log, no page view. The migration fills it from the day of the last Library write, the only activity date the instance has today.

**Flags are fixed rules, computed when the page opens.** No background job and no alert mail. The limits are constants in the code:

- **No activity**: no active day after the sign-up day, 14 days after sign-up.
- **Heavy writes**: more than 1000 records changed in 24 hours. A record keeps the time of its last write only, so this counts records, not writes.
- **Many Corrections**: more than 100 Series Corrections in 7 days.
- **Many sessions**: more than 10 open sessions.

The top of the Accounts part gives the totals of the instance: Accounts (total, new and active in 7 and 30 days), Invites (open, used, expired) and records.

**Every admin action goes to the Admin Log.** A table in `library.sqlite` keeps, for each action, the time, the Admin (or "script"), the action, the Account ID or the Invite it touched, and the reason or the label: a reference to the data, never a copy. It keeps no email address: a search with no match is logged with no address. Actions: role grant and revoke, Invites made and revoked, Account added and deleted, identity shown and searched. Rows older than 12 months are removed. The panel shows the log to every Admin (CNIL guidance on logs, spike 0006).

**The Privacy notice changes before the panel is used.** It says that an Admin role exists, what the panel shows, that the last active day and the Admin Log are kept and for how long, and that an Admin can add an Account for an address. The owner approves the English and French texts, and the notice gets a new date.

## Rejected

**A permission library.** Better Auth's `admin` plugin stores roles, but in its own user and session tables (ADR 0016 rejected Better Auth for that). Permit.io, Cerbos and OpenFGA need a hosted service or a second container, against ADR 0007. CASL, `accesscontrol`, Casbin and the small RBAC libraries evaluate rules only: the table, the grant and the script stay ours with each of them, and one role needs one comparison.

**An Admin named by a setting.** An `ADMIN_EMAILS` setting would give two sources for one fact, would need a restart to change, and could not be granted from the panel.

**Totals only, with no row for an Account.** It shows that something is wrong and not which Account, so the operator would go back to the shell and to SQL, with no log.

**Full identity in the list.** The operator can read every Library (ADR 0012), but a screen that lists every reader by address makes that easy and usual. The reference and the logged "Show identity" keep it an exception.

**A link with a token in the mail of an added Account.** It would be a second way to sign in, with the lifetime and the theft risks of a magic link, which ADR 0016 rejected.

**Suspend, or a block of an address.** The instance is invite-only: a deleted person needs a new Invite. A block list would keep the address of a person who asked for nothing.

**A second app or a second port for the panel.** One image and one server (ADR 0007).

## Consequences

- ADR 0013 gets an amendment: the admin panel is the one area checked on the server. ADR 0016 gets one: an Invite has an origin, an Admin makes Invites, and an Account can exist with no Invite. ADR 0017 said "no moderation screen in this version": that stays true for Series Corrections, which the panel only counts.
- `GLOSSARY.md` gets Admin, Operator, Account Reference and Admin Log; the Invite entry names an Admin, not "the owner".
- One Admin who is also the operator can read and change their own log, in the database. The log serves a second Admin and the readers who ask what was done; it does not constrain the operator.
- The reader's delete also removes the role of the Account. An Admin who deletes their own Account in Settings can leave the instance with no Admin; the script makes a new one.
- When the PDS cannot be reached, a delete by an Admin leaves the Shared records on the PDS, as the reader's delete does; the panel says so.
- The Admin Log keeps the Account ID of a deleted Account. It is a random number with no identity left.
- `scripts/role.ts` and the server files it imports are added to the `Dockerfile`, and follow the rules of the scripts that Node runs (`node:` and relative `.ts` imports only).
- The backups hold the roles, the last active days and the Admin Log, for up to 30 days after a delete, as the rest of `library.sqlite`.
