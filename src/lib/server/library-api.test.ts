import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleLibraryRequest, lexiconRules } from './library-api';
import { createLibraryStore, type LibraryStore } from './library-store';

const owner = 'did:plc:owner';
const other = 'did:plc:other';
const collection = 'app.atomes.readingStatus';
// A value no log line may hold.
const work = 'wd:Q-private-marker';
const status = (state: string) => ({
  $type: collection,
  work,
  isbn: '9782723478991',
  status: state,
  updatedAt: '2026-11-09T10:00:00.000Z',
});

let store: LibraryStore;

beforeEach(() => {
  store = createLibraryStore(':memory:');
});

afterEach(() => {
  store.close();
  vi.restoreAllMocks();
});

function call(did: string, method: string, path: string, body?: unknown) {
  const init: RequestInit = body === undefined ? { method } : { method, body: typeof body === 'string' ? body : JSON.stringify(body) };
  return handleLibraryRequest(new Request(`https://atomes.test/api/library/${path}`, init), { did, store, rules: lexiconRules });
}

describe('the Library API', () => {
  test('put, get, list and delete a record, then the record is gone', async () => {
    expect((await call(owner, 'PUT', `${collection}/a`, status('reading'))).status).toBe(200);
    await call(owner, 'PUT', `${collection}/b`, status('read'));

    expect(await (await call(owner, 'GET', `${collection}/a`)).json()).toEqual({ rkey: 'a', value: status('reading') });
    expect(await (await call(owner, 'GET', collection)).json()).toEqual({
      records: [
        { rkey: 'b', value: status('read') },
        { rkey: 'a', value: status('reading') },
      ],
    });

    expect((await call(owner, 'DELETE', `${collection}/a`)).status).toBe(200);
    expect((await call(owner, 'GET', `${collection}/a`)).status).toBe(404);
    expect(await (await call(owner, 'GET', collection)).json()).toEqual({ records: [{ rkey: 'b', value: status('read') }] });
    // Deleting a record that does not exist succeeds.
    expect((await call(owner, 'DELETE', `${collection}/missing`)).status).toBe(200);
  });

  test('a put replaces the record and gives a higher rev each time', async () => {
    const first = (await (await call(owner, 'PUT', `${collection}/a`, status('reading'))).json()) as { rev: number };
    const second = (await (await call(owner, 'PUT', `${collection}/a`, status('read'))).json()) as { rev: number };

    expect(second.rev).toBeGreaterThan(first.rev);
    expect(await (await call(owner, 'GET', `${collection}/a`)).json()).toEqual({ rkey: 'a', value: status('read') });
  });

  test("another reader's records are never visible, and cannot be changed", async () => {
    await call(owner, 'PUT', `${collection}/a`, status('read'));

    expect(await (await call(other, 'GET', collection)).json()).toEqual({ records: [] });
    expect((await call(other, 'GET', `${collection}/a`)).status).toBe(404);
    await call(other, 'DELETE', `${collection}/a`);
    await call(other, 'PUT', `${collection}/a`, status('abandoned'));

    expect(await (await call(owner, 'GET', `${collection}/a`)).json()).toEqual({ rkey: 'a', value: status('read') });
  });

  const createdAt = '2026-11-09T10:00:00.000Z';
  test.each([
    ['app.atomes.copy', { isbn: '9782723478991', works: ['wd:Q673'], details: { title: 'One Piece', volume: '1' }, createdAt }],
    ['app.atomes.follow', { series: 'wd:Q673', anchorIsbn: '9782723478991', status: 'following', updatedAt: createdAt }],
    ['app.atomes.label', { name: 'Manga', works: ['wd:Q673'], createdAt }],
    ['app.atomes.loan', { copy: '3m6n2vlwqkc2a', borrower: 'Sam', lentAt: createdAt, createdAt }],
    ['app.atomes.readingStatus', { work: 'wd:Q673', isbn: '9782723478991', status: 'read', finishedAt: createdAt, updatedAt: createdAt }],
    ['app.atomes.toBuy', { isbn: '9791043306471', createdAt }],
  ])('accepts a valid %s record and stores it as sent', async (type, fields) => {
    const record = { $type: type, ...fields };

    expect((await call(owner, 'PUT', `${type}/a`, record)).status).toBe(200);
    expect(store.get(owner, type, 'a')).toEqual(record);
  });

  test.each([
    [{ $type: collection, work, isbn: '9782723478991', updatedAt: '2026-11-09T10:00:00.000Z' }, 'Record must have the property "status"'],
    [{ ...status('read'), status: 42 }, 'Record/status must be a string'],
    [{ ...status('read'), updatedAt: 'yesterday' }, 'Record/updatedAt must be an valid atproto datetime'],
  ])('gives the lexicon reason when a record does not match: %j', async (record, reason) => {
    const response = await call(owner, 'PUT', `${collection}/a`, record);

    expect(response.status).toBe(400);
    const { error, message } = (await response.json()) as { error: string; message: string };
    expect(error).toBe('InvalidRecord');
    expect(message).toContain(reason);
    expect(store.list(owner, collection)).toEqual([]);
  });

  test.each([
    ['an unknown collection', 'PUT', 'app.bsky.feed.post/a', { $type: 'app.bsky.feed.post', text: 'x' }, 'InvalidCollection'],
    ['a record of another type', 'PUT', `${collection}/a`, { ...status('read'), $type: 'app.atomes.copy' }, 'InvalidRecord'],
    ['a record that does not match its lexicon', 'PUT', `${collection}/a`, { $type: collection, work }, 'InvalidRecord'],
    ['a body that is not JSON', 'PUT', `${collection}/a`, 'not json', 'InvalidRecord'],
    ['a bad record key', 'PUT', `${collection}/a%20b`, status('read'), 'InvalidRecordKey'],
    ['a path too deep', 'GET', `${collection}/a/b`, undefined, 'InvalidRecordKey'],
  ])('refuses %s, and stores nothing', async (_, method, path, body, error) => {
    const response = await call(owner, method, path, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error });
    expect(store.list(owner, collection)).toEqual([]);
  });

  test('never logs a record value, and never puts one in an error', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const answers: unknown[] = [];
    const keep = async (response: Promise<Response>) => answers.push(await (await response).text());

    await keep(call(owner, 'PUT', `${collection}/a`, status('read')));
    await keep(call(owner, 'PUT', `${collection}/b`, { $type: collection, work, status: 42 }));
    await keep(call(owner, 'PUT', `${collection}/c`, { ...status('read'), $type: 'app.atomes.copy' }));
    await keep(call(owner, 'GET', collection));
    await keep(call(owner, 'DELETE', `${collection}/a`));

    const logged = JSON.stringify(logs.map((log) => log.mock.calls));
    expect(logged).not.toContain(work);
    // Only the list holds the value: it is the reader's own answer.
    expect(answers.filter((answer) => String(answer).includes(work))).toHaveLength(1);
  });
});
