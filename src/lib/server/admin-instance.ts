// What the admin panel and the admin API read and write on this server
// (ADR 0020). Apart from instance.ts: the Catalog instance imports that file.
import { catalog } from '../catalog/instance';
import type { AdminDeps } from './admin';
import { createAdminStore, type AdminStore } from './admin-store';
import { accountStore, authDeps, libraryDatabase, roleStore } from './instance';
import { settings } from './settings';

let adminStore: AdminStore | undefined;

export async function adminDeps(): Promise<AdminDeps> {
  const { store } = await authDeps();
  adminStore ??= createAdminStore(libraryDatabase());
  const { appOrigin, port } = settings();
  return { store, roles: roleStore(), accounts: accountStore(), admin: adminStore, catalog: catalog(), site: appOrigin ?? `http://127.0.0.1:${port}` };
}
