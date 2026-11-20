// The admin panel on the server (ADR 0020): the gate, and the admin API.
// The panel is the one area checked on the server (ADR 0013, amendment): each
// admin page and each admin API route reads the browser session and the role
// of its Account from the tables, on every request, so a revoke works at once.
// Anyone else gets the same 404 as an unknown path, with no redirect: the
// panel does not show that it exists. Every answer is `no-store`. The
// middleware refuses a write from another site (security.ts).
import type { AccountId } from './accounts';
import { readerOf } from './auth';
import type { AuthStore } from './auth-store';
import { can, type Roles } from './roles';

export interface AdminGateDeps {
  store: AuthStore;
  roles: Pick<Roles, 'rolesOf'>;
}

export type AdminDeps = AdminGateDeps;

export const noStore = { 'cache-control': 'no-store' };

export const notFound = () => Response.json({ error: 'NotFound', message: 'Not found' }, { status: 404, headers: noStore });

// The Admin of this request, or undefined: no session, or an Account with no
// right to open the panel.
export function adminOf(request: Request, { store, roles }: AdminGateDeps): { account: AccountId } | undefined {
  const reader = readerOf(request, { store });
  if (!reader || !can(roles.rolesOf(reader.account), 'panel.open')) return undefined;
  return { account: reader.account };
}

// Every route under /api/admin/ (src/pages/api/admin/[...path].ts).
export function handleAdminRequest(request: Request, deps: AdminDeps): Promise<Response> {
  const admin = adminOf(request, deps);
  if (!admin) return Promise.resolve(notFound());
  return Promise.resolve(notFound());
}
