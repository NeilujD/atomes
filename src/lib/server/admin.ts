// The admin panel on the server (ADR 0020): the gate, and the admin API.
// The panel is the one area checked on the server (ADR 0013, amendment): each
// admin page and each admin API route reads the browser session and the role
// of its Account from the tables, on every request, so a revoke works at once.
// Anyone else gets the same 404 as an unknown path, with no redirect: the
// panel does not show that it exists. Every answer is `no-store`. The
// middleware refuses a write from another site (security.ts).
//   GET  /api/admin/accounts      { totals, accounts: AccountRow[] }; ?flagged=1: flagged Accounts only
//   GET  /api/admin/admins        { admins: AdminRow[] }
//   POST /api/admin/roles/grant   { email } -> 200 { account } | 400 BadAddress | 422 NoAccount
//   POST /api/admin/roles/revoke  { account } -> 200 | 403 OwnRole | 409 NotAdmin
//   GET  /api/admin/log           { lines: LogRow[] }
// An answer names a reader by Account Reference only; an Admin by identity.
import type { Catalog } from '../catalog/catalog';
import type { AccountId, Accounts } from './accounts';
import { accountRows, totalsOf, type AccountRow, type Totals } from './admin-accounts';
import type { AdminAction } from './admin-log';
import type { AdminStore } from './admin-store';
import { readerOf } from './auth';
import type { AuthStore } from './auth-store';
import { can, type Permission, type Roles } from './roles';
import { normalEmail } from './sign-in-codes';

export interface AdminGateDeps {
  store: AuthStore;
  roles: Pick<Roles, 'rolesOf'>;
}

export interface AdminDeps extends AdminGateDeps {
  roles: Roles;
  accounts: Pick<Accounts, 'identitiesOf'>;
  admin: AdminStore;
  catalog: Pick<Catalog, 'correctionCounts'>;
}

export const noStore = { 'cache-control': 'no-store' };

export const notFound = () => Response.json({ error: 'NotFound', message: 'Not found' }, { status: 404, headers: noStore });
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
  // The name of the Admin who granted it; null for the script.
  grantedBy: string | null;
  you: boolean;
}

export interface LogRow {
  at: number;
  // The name of the Admin (their Account Reference once deleted); null for the script.
  admin: string | null;
  action: AdminAction;
  // The Account Reference of the Account it touched; null for an Invite or a search with no match.
  target: string | null;
  detail: string | null;
}

// How the panel names an Admin: an Admin is not pseudonymous to the other Admins.
function nameOf({ accounts, store }: AdminDeps, account: string, references: Map<string, string>): string {
  const { email, did } = accounts.identitiesOf(account as AccountId);
  return email ?? store.handleOf(account as AccountId) ?? did ?? references.get(account) ?? account;
}

// The totals of the instance and one row for each Account, from grouped
// queries on the three SQLite files. Nothing in it names a reader.
export function accountsView(deps: AdminDeps, { flagged = false, now = Date.now() } = {}): { totals: Totals; accounts: AccountRow[] } {
  const sessions = deps.store.sessionCounts();
  const corrections = deps.catalog.correctionCounts(new Date(now - 7 * 24 * 3600 * 1000));
  const facts = deps.admin.accountFacts(now).map((each) => ({
    ...each,
    sessions: sessions.get(each.account) ?? 0,
    corrections: corrections.get(each.account)?.total ?? 0,
    corrections7d: corrections.get(each.account)?.recent ?? 0,
  }));
  const rows = accountRows(facts, deps.admin.references(), now);
  return { totals: totalsOf(facts, deps.admin.inviteTotals(now), now), accounts: flagged ? rows.filter(({ flags }) => flags.length > 0) : rows };
}

export function adminRows(deps: AdminDeps, you: AccountId): AdminRow[] {
  const references = deps.admin.references();
  return deps.roles.admins().map(({ account, grantedAt, grantedBy }) => ({
    account,
    name: nameOf(deps, account, references),
    grantedAt,
    grantedBy: grantedBy === null ? null : nameOf(deps, grantedBy, references),
    you: account === you,
  }));
}

export function logRows(deps: AdminDeps): LogRow[] {
  const references = deps.admin.references();
  return deps.admin.log().map(({ at, admin, action, target, detail }) => ({
    at,
    admin: admin === null ? null : nameOf(deps, admin, references),
    action,
    target: target === null || action.startsWith('invite.') ? null : (references.get(target) ?? null),
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
    run: (request, deps) => answer(accountsView(deps, { flagged: new URL(request.url).searchParams.get('flagged') === '1' })),
  },
  'GET /api/admin/admins': { permission: 'panel.open', run: (_, deps, admin) => answer({ admins: adminRows(deps, admin) }) },
  'GET /api/admin/log': { permission: 'log.read', run: (_, deps) => answer({ lines: logRows(deps) }) },
  'POST /api/admin/roles/grant': {
    permission: 'roles.grant',
    async run(request, deps, admin) {
      const address = normalEmail((await bodyOf(request)).email);
      if (!address) return refused(400, 'BadAddress');
      const account = deps.roles.accountOf(address);
      if (account === undefined) {
        // A search with no match: no target, and never the address.
        deps.admin.write({ admin, action: 'identity.find', target: null, detail: null });
        return refused(422, 'NoAccount');
      }
      deps.roles.grant(account, admin);
      return answer({ account });
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
