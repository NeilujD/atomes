// The admin panel on the server (ADR 0020): the gate, and the admin API.
// The panel is the one area checked on the server (ADR 0013, amendment): each
// admin page and each admin API route reads the browser session and the role
// of its Account from the tables, on every request, so a revoke works at once.
// Anyone else gets the same 404 as an unknown path, with no redirect: the
// panel does not show that it exists. Every answer to an Admin is `no-store`. The
// middleware refuses a write from another site (security.ts).
//   GET  /api/admin/accounts      { totals, accounts: AccountRow[] }; ?flagged=1: flagged Accounts only
//   POST /api/admin/accounts      { email, language } -> 201 { reference, mailSent } | 400 BadAddress | 400 BadLanguage
//                                 | 409 Exists (logged) | 429 TooMany (20 tries in one hour).
//                                 One mail to the person; no Invite.
//   POST /api/admin/accounts/delete { account, reference } -> 200 { sharedLeft } | 400 WrongReference
//                                 | 403 OwnAccount | 403 IsAdmin | 409 NoAccount. The full delete of
//                                 "Delete my account"; `reference` is the Account Reference the Admin typed.
//   GET  /api/admin/invites       { invites: InviteRow[] }
//   POST /api/admin/invites       { count, label? } -> 201 { invites: { id, tag, link }[], expiresAt } | 400 BadCount | 400 BadLabel
//                                 The links are in this answer only: never stored, never logged.
//   POST /api/admin/invites/revoke { id } -> 200 | 409 NotOpen
//   POST /api/admin/identity/show { account, reason } -> 200 { email?, atproto? } | 400 BadReason | 409 NoAccount
//   POST /api/admin/identity/find { email, reason } -> 200 { reference | null } | 400 BadReason | 400 BadAddress
//                                 The two answers that name a reader, each after a reason of 3 to 200
//                                 characters, each written to the Admin Log first. The typed address is never stored.
//   GET  /api/admin/admins        { admins: AdminRow[] }
//   POST /api/admin/roles/grant   { email } | { reference } -> 200 | 400 BadAddress | 422 NoAccount
//   POST /api/admin/roles/revoke  { account } -> 200 | 403 OwnRole | 409 NotAdmin
//   GET  /api/admin/log           { lines: LogRow[] }
// An answer names a reader by Account Reference only; an Admin by identity.
import { createHash } from 'node:crypto';
import type { Catalog } from '../catalog/catalog';
import { languages, type Language } from '../i18n/i18n';
import { forgetAccount, type DeleteDeps } from './account-data';
import { errorLogText, type AccountId, type Accounts } from './accounts';
import { accountRows, totalsOf, type AccountRow, type Totals } from './admin-accounts';
import type { AdminAction } from './admin-log';
import type { AdminStore, InviteFacts } from './admin-store';
import { readerOf } from './auth';
import type { AuthStore } from './auth-store';
import { can, type Permission, type Roles } from './roles';
import { accountAddedMail, type SendMail } from './mail';
import { normalEmail, type SignInCodes } from './sign-in-codes';

export interface AdminGateDeps {
  store: AuthStore;
  roles: Pick<Roles, 'rolesOf'>;
}

export interface AdminDeps extends AdminGateDeps {
  roles: Roles;
  accounts: Pick<Accounts, 'identitiesOf'>;
  admin: AdminStore;
  catalog: Pick<Catalog, 'correctionCounts'>;
  // The origin of the instance, for an Invite link (settings.ts), never of the request.
  site: string;
  sendMail: SendMail;
  // The limit store that sign-in uses (auth.sqlite).
  limits: Pick<SignInCodes, 'allow'>;
  // The operator's contact of the instance settings (LEGAL_CONTACT), named in the mail of an added Account.
  contact?: string;
  // The stores of the delete of an Account, as "Delete my account" has them.
  deletion: DeleteDeps;
}

export const noStore = { 'cache-control': 'no-store' };

// The answer to anyone but an Admin, and for an unknown admin path: a bare
// 404, with no body and no header of its own, so Astro answers the 404 of the
// app, as it does for a path that does not exist.
export const notFound = () => new Response(null, { status: 404 });
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const refused = (status: number, error: string) => answer({ error }, status);

// The Admin of this request, or undefined: no session, or an Account with no
// right to open the panel.
export function adminOf(request: Request, { store, roles }: AdminGateDeps): { account: AccountId } | undefined {
  const reader = readerOf(request, { store });
  if (!reader || !can(roles.rolesOf(reader.account), 'panel.open')) return undefined;
  return { account: reader.account };
}

export interface AdminRow {
  account: string;
  // Email address, else handle, else DID.
  name: string;
  grantedAt: number;
  // The Admin who granted it, named as in the log; null for the script.
  grantedBy: string | null;
  you: boolean;
}

export interface LogRow {
  at: number;
  // The name of the Admin (their Account Reference once they are no Admin); null for the script.
  admin: string | null;
  action: AdminAction;
  // The Account it touched: its Account Reference, or its name when it is an Admin now; null for an Invite or a search with no match.
  target: string | null;
  detail: string | null;
}

// How the panel names an Account: an Admin of now by identity (email address,
// else handle, else DID), since an Admin is not pseudonymous to the other
// Admins; any other Account, a former Admin and a deleted Account too, by its
// Account Reference. One lookup for each Account.
function namer(deps: AdminDeps): (account: string) => string {
  const references = deps.admin.references();
  const admins = new Set(deps.roles.admins().map(({ account }) => account));
  const names = new Map<string, string>();
  return (account) => {
    let name = names.get(account);
    if (name === undefined) {
      const { email, did } = admins.has(account) ? deps.accounts.identitiesOf(account as AccountId) : {};
      name = email ?? (did && (deps.store.handleOf(account as AccountId) ?? did)) ?? references.get(account) ?? account;
      names.set(account, name);
    }
    return name;
  };
}

// The totals of the instance and one row for each Account, from grouped
// queries on the three SQLite files. Nothing in it names a reader.
// A row as the Admin `you` sees it. The panel deletes neither their own Account (Settings does that) nor an Admin (revoke the role first).
export type AccountsRow = AccountRow & { you: boolean; admin: boolean };

export function accountsView(
  deps: AdminDeps,
  { you, flagged = false, now = Date.now() }: { you: string; flagged?: boolean; now?: number },
): { totals: Totals; accounts: AccountsRow[] } {
  const sessions = deps.store.sessionCounts();
  const corrections = deps.catalog.correctionCounts(new Date(now - 7 * 24 * 3600 * 1000));
  const facts = deps.admin.accountFacts(now).map((each) => ({
    ...each,
    sessions: sessions.get(each.account) ?? 0,
    corrections: corrections.get(each.account)?.total ?? 0,
    corrections7d: corrections.get(each.account)?.recent ?? 0,
  }));
  const admins = new Set(deps.roles.admins().map(({ account }) => account));
  const rows = accountRows(facts, deps.admin.references(), now).map((row) => ({ ...row, you: row.account === you, admin: admins.has(row.account) }));
  return { totals: totalsOf(facts, deps.admin.inviteTotals(now), now), accounts: flagged ? rows.filter(({ flags }) => flags.length > 0) : rows };
}

// Accounts an Admin adds in one hour: an error or a stolen session cannot send mail to many addresses.
export const addLimit = { max: 20, windowMs: 3600 * 1000 } as const;

export const reasonLimits = { min: 3, max: 200 } as const;

// The Admin Log keeps no email address: a reason or a label that holds one is refused.
const holdsAddress = (text: string) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text);

// The reason an Admin typed, or the refusal.
function reasonOf(value: unknown): { reason: string } | { refusal: Response } {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < reasonLimits.min || reason.length > reasonLimits.max) return { refusal: refused(400, 'BadReason') };
  if (holdsAddress(reason)) return { refusal: refused(400, 'ReasonHasAddress') };
  return { reason };
}

export const inviteLimits = { maxCount: 50, maxLabel: 60 } as const;

// The short name of an Invite: the start of its token hash. The made link and its row in the list show it, so the Admin knows which row is which link.
export const inviteTag = (id: string) => id.slice(0, 6).toUpperCase();

// An Invite in the list: its maker and the Account that used it show as Account References.
export type InviteRow = Omit<InviteFacts, 'madeBy' | 'usedBy'> & { tag: string; madeBy: string | null; usedBy: string | null; canRevoke: boolean };

export function inviteRows(deps: AdminDeps, now = Date.now()): InviteRow[] {
  const references = deps.admin.references();
  const reference = (account: string | null) => (account === null ? null : (references.get(account) ?? null));
  return deps.admin.invites(now).map((invite) => ({
    ...invite,
    tag: inviteTag(invite.id),
    madeBy: reference(invite.madeBy),
    usedBy: reference(invite.usedBy),
    canRevoke: invite.state === 'open' && invite.origin !== 'reader',
  }));
}

export function adminRows(deps: AdminDeps, you: AccountId): AdminRow[] {
  const nameOf = namer(deps);
  return deps.roles.admins().map(({ account, grantedAt, grantedBy }) => ({
    account,
    name: nameOf(account),
    grantedAt,
    grantedBy: grantedBy === null ? null : nameOf(grantedBy),
    you: account === you,
  }));
}

export function logRows(deps: AdminDeps): LogRow[] {
  const nameOf = namer(deps);
  return deps.admin.log().map(({ at, admin, action, target, detail }) => ({
    at,
    admin: admin === null ? null : nameOf(admin),
    action,
    target: target === null || action.startsWith('invite.') ? null : nameOf(target),
    detail,
  }));
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

type Route = (request: Request, deps: AdminDeps, admin: AccountId) => Response | Promise<Response>;

const routes: Record<string, { permission: Permission; run: Route }> = {
  'GET /api/admin/accounts': {
    permission: 'accounts.read',
    run: (request, deps, admin) => answer(accountsView(deps, { you: admin, flagged: new URL(request.url).searchParams.get('flagged') === '1' })),
  },
  'POST /api/admin/accounts': {
    permission: 'accounts.add',
    async run(request, deps, admin) {
      const { email, language } = await bodyOf(request);
      const address = normalEmail(email);
      if (!address) return refused(400, 'BadAddress');
      if (!languages.includes(language as Language)) return refused(400, 'BadLanguage');
      // Each try counts, so the form cannot test many addresses. The key holds a hash: no Account ID stays in auth.sqlite after a delete.
      if (!deps.limits.allow(`admin-add:${createHash('sha256').update(admin).digest('hex')}`, addLimit.max, addLimit.windowMs)) return refused(429, 'TooMany');
      const account = deps.admin.addAccount(admin, address);
      if (account === undefined) {
        // The Admin learned that this address has an Account: a trace, with no address.
        deps.admin.write({ admin, action: 'account.add-exists', target: deps.roles.accountOf(address) ?? null, detail: null });
        return refused(409, 'Exists');
      }
      // The Account stays when the mail fails; the panel says so. No address reaches a log line.
      const mailSent = await deps.sendMail(accountAddedMail(address, language as Language, deps.site, deps.contact)).then(
        () => true,
        (error: unknown) => {
          console.warn(`Added-Account mail failed: ${errorLogText(error).replaceAll(address, '[address]')}`);
          return false;
        },
      );
      return answer({ reference: deps.admin.references().get(account), mailSent }, 201);
    },
  },
  'POST /api/admin/accounts/delete': {
    permission: 'accounts.delete',
    async run(request, deps, admin) {
      const { account, reference } = await bodyOf(request);
      if (typeof account !== 'string' || !deps.admin.hasAccount(account)) return refused(409, 'NoAccount');
      if (account === admin) return refused(403, 'OwnAccount');
      if (can(deps.roles.rolesOf(account), 'panel.open')) return refused(403, 'IsAdmin');
      // The Admin typed the Account Reference of this Account, and of no other.
      if (typeof reference !== 'string' || reference.trim().toUpperCase() !== deps.admin.references().get(account)) return refused(400, 'WrongReference');
      // The log line first: no delete runs with no trace, even one that fails on its way.
      deps.admin.write({ admin, action: 'account.delete', target: account, detail: null });
      const { sharedLeft } = await forgetAccount(account as AccountId, deps.deletion);
      return answer({ sharedLeft });
    },
  },
  'GET /api/admin/invites': { permission: 'invites.make', run: (_, deps) => answer({ invites: inviteRows(deps) }) },
  'POST /api/admin/invites': {
    permission: 'invites.make',
    async run(request, deps, admin) {
      const { count, label } = await bodyOf(request);
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > inviteLimits.maxCount) return refused(400, 'BadCount');
      if (label !== undefined && label !== null && typeof label !== 'string') return refused(400, 'BadLabel');
      const text = (label ?? '').trim();
      if (text.length > inviteLimits.maxLabel || holdsAddress(text)) return refused(400, 'BadLabel');
      const { made, expiresAt } = deps.admin.makeInvites(admin, count, text || null);
      const invites = made.map(({ token, id }) => ({ id, tag: inviteTag(id), link: `${deps.site}/sign-in#invite=${token}` }));
      return answer({ invites, expiresAt }, 201);
    },
  },
  'POST /api/admin/invites/revoke': {
    permission: 'invites.revoke',
    async run(request, deps, admin) {
      const { id } = await bodyOf(request);
      if (typeof id !== 'string' || !deps.admin.revokeInvite(admin, id)) return refused(409, 'NotOpen');
      return answer({});
    },
  },
  'POST /api/admin/identity/show': {
    permission: 'identity.show',
    async run(request, deps, admin) {
      const { account, reason: typed } = await bodyOf(request);
      const checked = reasonOf(typed);
      if ('refusal' in checked) return checked.refusal;
      if (typeof account !== 'string' || !deps.admin.hasAccount(account)) return refused(409, 'NoAccount');
      // The log line first: no identity leaves with no trace.
      deps.admin.write({ admin, action: 'identity.show', target: account, detail: checked.reason });
      const { email, did } = deps.accounts.identitiesOf(account as AccountId);
      return answer({ email, atproto: did && (deps.store.handleOf(account as AccountId) ?? did) });
    },
  },
  'POST /api/admin/identity/find': {
    permission: 'identity.show',
    async run(request, deps, admin) {
      const { email, reason: typed } = await bodyOf(request);
      const checked = reasonOf(typed);
      if ('refusal' in checked) return checked.refusal;
      const address = normalEmail(email);
      if (!address) return refused(400, 'BadAddress');
      const account = deps.roles.accountOf(address);
      // With no match: no target. The typed address is never stored.
      deps.admin.write({ admin, action: 'identity.find', target: account ?? null, detail: checked.reason });
      return answer({ reference: account === undefined ? null : (deps.admin.references().get(account) ?? null) });
    },
  },
  'GET /api/admin/admins': { permission: 'panel.open', run: (_, deps, admin) => answer({ admins: adminRows(deps, admin) }) },
  'GET /api/admin/log': { permission: 'log.read', run: (_, deps) => answer({ lines: logRows(deps) }) },
  'POST /api/admin/roles/grant': {
    permission: 'roles.grant',
    async run(request, deps, admin) {
      const { email, reference } = await bodyOf(request);
      // By Account Reference: the Accounts part shows it, so an Account with no email address can get the role too.
      if (typeof reference === 'string') {
        const typed = reference.trim().toUpperCase();
        const account = [...deps.admin.references()].find(([id, each]) => each === typed && deps.admin.hasAccount(id))?.[0];
        if (account === undefined) return refused(422, 'NoAccount');
        deps.roles.grant(account, admin);
        return answer({});
      }
      const address = normalEmail(email);
      if (!address) return refused(400, 'BadAddress');
      const account = deps.roles.accountOf(address);
      if (account === undefined) {
        // The Admin learned that no Account has this address: a trace with no target, and never the address.
        deps.admin.write({ admin, action: 'role.grant-no-account', target: null, detail: null });
        return refused(422, 'NoAccount');
      }
      deps.roles.grant(account, admin);
      return answer({});
    },
  },
  'POST /api/admin/roles/revoke': {
    permission: 'roles.revoke',
    async run(request, deps, admin) {
      const { account } = await bodyOf(request);
      if (account === admin) return refused(403, 'OwnRole');
      if (typeof account !== 'string' || !deps.roles.revoke(account, admin)) return refused(409, 'NotAdmin');
      return answer({});
    },
  },
};

// Every route under /api/admin/ (src/pages/api/admin/[...path].ts).
export async function handleAdminRequest(request: Request, deps: AdminDeps): Promise<Response> {
  const admin = adminOf(request, deps);
  if (!admin) return notFound();
  const route = routes[`${request.method} ${new URL(request.url).pathname}`];
  if (!route || !can(deps.roles.rolesOf(admin.account), route.permission)) return notFound();
  return route.run(request, deps, admin.account);
}
