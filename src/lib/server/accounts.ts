// Accounts (ADR 0016): what a reader signs in to. A random Account ID owns the
// Library in every table of `library.sqlite`; an email address and a DID are
// identities of an Account, at most one of each, each in one Account only. The
// tables live in `library.sqlite`, which is backed up.
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inviteIsOpen, makeReaderInvite, readerInvite, useInvite, type ReaderInvite } from './invites';
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

// What linking an identity to an Account gave: `taken`, it belongs to another
// Account; `has-one`, the Account has another identity of this kind. Nothing
// is merged.
export type LinkResult = 'linked' | 'taken' | 'has-one';

export interface Accounts {
  // The Account of the DID. Makes one, with this DID as its identity, the
  // first time, with no Invite: only for the migrations and /dev/sign-in-as.
  ofDid(did: Did): AccountId;
  // As ofDid, for an email address that is trimmed and lower-cased already:
  // only for the owner's Account on a pull request preview (settings.ts,
  // PREVIEW_ACCOUNT_EMAIL). The reader still signs in with a Sign-in Code.
  ofEmail(email: string): AccountId;
  // The Account of the DID, or undefined: makes none.
  findDid(did: Did): AccountId | undefined;
  // The Account of the DID. The first time, makes one only with an open
  // Invite, and uses it up in the same transaction; else NoInviteError.
  signIn(did: Did, invite: string | undefined): AccountId;
  // True when signIn would give an Account. Writes nothing.
  maySignIn(did: Did, invite: string | undefined): boolean;
  // As signIn and maySignIn, for an email address that a Sign-in Code proved
  // (email-sign-in.ts). The address is trimmed and lower-cased already.
  signInEmail(email: string, invite: string | undefined): AccountId;
  maySignInEmail(email: string, invite: string | undefined): boolean;
  // The Invite is not used and not expired.
  inviteIsOpen(invite: string): boolean;
  // The Invite the reader of `account` made in Settings (CORE-134).
  inviteOf(account: AccountId): ReaderInvite;
  // A new Invite of the reader, which cancels their open one; undefined once
  // a person made an Account with one of their Invites.
  makeInvite(account: AccountId): { token: string; expiresAt: number } | undefined;
  // Adds an identity the reader proved (Settings, ADR 0016). The same
  // identity again gives `linked`.
  link(account: AccountId, kind: 'did' | 'email', value: string): LinkResult;
  // Empty for an unknown Account.
  identitiesOf(account: AccountId): Identities;
  // Deletes the Account and its identities (CORE-55). The Invite it signed up
  // with stays used, with no Account; so does the Invite it made and a person
  // used. Its open Invite is deleted.
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
  type Kind = 'did' | 'email';
  const find = (kind: Kind, value: string) =>
    (db.prepare('select account from identity where kind = ? and value = ?').get(kind, value) as { account: AccountId } | undefined)?.account;
  // `invite` is used up for the new Account in the same transaction.
  const make = (kind: Kind, value: string, invite?: string) => {
    const account = newAccountId();
    inTransaction(db, () => {
      db.prepare('insert into account (id, created_at) values (?, ?)').run(account, new Date().toISOString());
      if (invite !== undefined && !useInvite(db, invite, account)) throw new NoInviteError();
      db.prepare('insert into identity (account, kind, value) values (?, ?, ?)').run(account, kind, value);
    });
    return account;
  };
  const signIn = (kind: Kind, value: string, invite: string | undefined) => {
    const known = find(kind, value);
    if (known) return known;
    if (invite === undefined) throw new NoInviteError();
    return make(kind, value, invite);
  };
  const maySignIn = (kind: Kind, value: string, invite: string | undefined) =>
    find(kind, value) !== undefined || (invite !== undefined && inviteIsOpen(db, invite));
  return {
    ofDid: (did) => find('did', did) ?? make('did', did),
    ofEmail: (email) => find('email', email) ?? make('email', email),
    signIn: (did, invite) => signIn('did', did, invite),
    signInEmail: (email, invite) => signIn('email', email, invite),
    findDid: (did) => find('did', did),
    maySignIn: (did, invite) => maySignIn('did', did, invite),
    maySignInEmail: (email, invite) => maySignIn('email', email, invite),
    inviteIsOpen: (invite) => inviteIsOpen(db, invite),
    inviteOf: (account) => readerInvite(db, account),
    makeInvite: (account) => makeReaderInvite(db, account),
    link(account, kind, value) {
      return inTransaction(db, (): LinkResult => {
        const owner = find(kind, value);
        if (owner !== undefined) return owner === account ? 'linked' : 'taken';
        if (db.prepare('select 1 from identity where account = ? and kind = ?').get(account, kind)) return 'has-one';
        db.prepare('insert into identity (account, kind, value) values (?, ?, ?)').run(account, kind, value);
        return 'linked';
      });
    },
    identitiesOf(account) {
      const rows = db.prepare('select kind, value from identity where account = ?').all(account) as { kind: 'did' | 'email'; value: string }[];
      return Object.fromEntries(rows.map(({ kind, value }) => [kind, value]));
    },
    forget(account) {
      inTransaction(db, () => {
        db.prepare('update invite set used_by = null where used_by = ?').run(account);
        // Its open Invite goes; its used one stays used, with no maker.
        db.prepare('delete from invite where made_by = ? and used_at is null').run(account);
        db.prepare('update invite set made_by = null where made_by = ?').run(account);
        db.prepare('delete from identity where account = ?').run(account);
        db.prepare('delete from account where id = ?').run(account);
      });
    },
    close: () => db.close(),
  };
}
