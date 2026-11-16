// Accounts (ADR 0016): what a reader signs in to. A random Account ID owns the
// Library in every table of `library.sqlite`; an email address and a DID are
// identities of an Account, at most one of each, each in one Account only. The
// tables live in `library.sqlite`, which is backed up.
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inviteIsOpen, useInvite } from './invites';
import { inTransaction } from './migrate';

// An AT Protocol DID. An AccountId is not one, and the type says so: a store
// key never goes to a PDS by mistake.
export type Did = `did:${string}`;
declare const accountBrand: unique symbol;
export type AccountId = string & { readonly [accountBrand]: 'AccountId' };

export interface Identities {
  did?: Did;
  email?: string;
}

export interface Accounts {
  // The Account of the DID. Makes one, with this DID as its identity, the
  // first time, with no Invite: only for the migrations and /dev/sign-in-as.
  ofDid(did: Did): AccountId;
  // The Account of the DID, or undefined: makes none.
  findDid(did: Did): AccountId | undefined;
  // The Account of the DID. The first time, makes one only with an open
  // Invite, and uses it up in the same transaction; else NoInviteError.
  signIn(did: Did, invite: string | undefined): AccountId;
  // True when signIn would give an Account. Writes nothing.
  maySignIn(did: Did, invite: string | undefined): boolean;
  // The Invite is not used and not expired.
  inviteIsOpen(invite: string): boolean;
  // Empty for an unknown Account.
  identitiesOf(account: AccountId): Identities;
  // Deletes the Account and its identities (CORE-55). Its Invite stays used,
  // with no Account.
  forget(account: AccountId): void;
  close(): void;
}

export const newAccountId = () => randomUUID() as AccountId;

const ids = [/did:[a-z0-9]+:[A-Za-z0-9._:%-]+/g, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi];

// The DID has no Account, and no open Invite came with it. The message names
// no DID and no Invite: it is logged.
export class NoInviteError extends Error {
  constructor() {
    super('A new Account needs an Invite');
    this.name = 'NoInviteError';
  }
}

// An error as a log line may hold it: its name and message, with any DID or
// Account ID left out. Errors of other libraries (OAuth, identity) may name them.
export function errorLogText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  return ids.reduce((line, id) => line.replace(id, '[id]'), text);
}

// `db` has run `librarySteps` (migrations.ts). Closes it.
export function createAccounts(db: DatabaseSync): Accounts {
  const find = (did: Did) =>
    (db.prepare("select account from identity where kind = 'did' and value = ?").get(did) as { account: AccountId } | undefined)?.account;
  // `invite` is used up for the new Account in the same transaction.
  const make = (did: Did, invite?: string) => {
    const account = newAccountId();
    inTransaction(db, () => {
      db.prepare('insert into account (id, created_at) values (?, ?)').run(account, new Date().toISOString());
      if (invite !== undefined && !useInvite(db, invite, account)) throw new NoInviteError();
      db.prepare("insert into identity (account, kind, value) values (?, 'did', ?)").run(account, did);
    });
    return account;
  };
  return {
    ofDid: (did) => find(did) ?? make(did),
    signIn(did, invite) {
      const known = find(did);
      if (known) return known;
      if (invite === undefined) throw new NoInviteError();
      return make(did, invite);
    },
    findDid: find,
    maySignIn: (did, invite) => find(did) !== undefined || (invite !== undefined && inviteIsOpen(db, invite)),
    inviteIsOpen: (invite) => inviteIsOpen(db, invite),
    identitiesOf(account) {
      const rows = db.prepare('select kind, value from identity where account = ?').all(account) as { kind: 'did' | 'email'; value: string }[];
      return Object.fromEntries(rows.map(({ kind, value }) => [kind, value]));
    },
    forget(account) {
      inTransaction(db, () => {
        db.prepare('update invite set used_by = null where used_by = ?').run(account);
        db.prepare('delete from identity where account = ?').run(account);
        db.prepare('delete from account where id = ?').run(account);
      });
    },
    close: () => db.close(),
  };
}
