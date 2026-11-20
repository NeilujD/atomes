// What the admin panel and the admin API read and write on this server
// (ADR 0020). Apart from instance.ts: the Catalog instance imports that file.
import { catalog } from '../catalog/instance';
import type { AdminDeps } from './admin';
import { createAdminStore, type AdminStore } from './admin-store';
import { accountStore, emailSignInDeps, libraryDatabase, roleStore } from './instance';
import { legalFacts } from './settings';

let adminStore: AdminStore | undefined;

export async function adminDeps(): Promise<AdminDeps> {
  // The store, the limits, the mail and the origin of the instance, as sign-in has them.
  const { store, codes, sendMail, site } = await emailSignInDeps();
  adminStore ??= createAdminStore(libraryDatabase());
  return {
    store,
    roles: roleStore(),
    accounts: accountStore(),
    admin: adminStore,
    catalog: catalog(),
    site,
    sendMail,
    limits: codes,
    contact: legalFacts(process.env).contact,
  };
}
