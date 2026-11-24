// Search (ADR 0021): find a Work by title words in Inventaire, then list its
// Editions from Inventaire and BnF, merged by ISBN-13. Only the typed words,
// and the titles, authors and identifiers the sources gave back, leave the
// server. The answers are kept 24 hours (`answerCache`).
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isIsbn13 } from '../library/ids';
import { bcp47 } from './languages';
import { inTransaction } from '../server/migrate';
import { key } from './facts';
import { read, sourceUrls, type SourceFetch } from './sources';
import { isbn10To13, isbns, publishedYear, subfield, unimarcRecords, type UnimarcRecord } from './unimarc';

// A row of Search: one Work, under the title that matched the words.
// `also`: the other identifiers of the same Work, whose Editions it shares.
// `language`: the language of that title ("en"), null when no title of the
// Work holds every word (and on a Work of an Author page); on a BnF row, the
// language of its first record.
// `words`: a BnF row (`bnf:`) only, the words of the search that found it,
// which open it again.
export interface WorkResult {
  id: string;
  also: string[];
  title: string;
  authors: string[];
  year: number | null;
  language: string | null;
  words?: string;
}

// An Author row of Search (CORE-188): `works` counts their Works in Inventaire.
export interface AuthorResult {
  id: string;
  name: string;
  birthYear: number | null;
  works: number;
}

export interface Found {
  works: WorkResult[];
  authors: AuthorResult[];
}

// One page of the Works of an Author, newest first; `total` counts them all.
export interface AuthorWorks {
  works: WorkResult[];
  total: number;
}

export const authorPageSize = 20;

// One Edition of a Work, as printed: its title, year, publisher and collection.
// `language` is an ISO 639-2/B code, as BnF gives it ("fre").
export interface EditionResult {
  isbn: string;
  title: string;
  year: number | null;
  publisher: string | null;
  collection: string | null;
  language: string | null;
}

// The Editions in one language ("fr"; null: all languages). `matches`: the
// language of the words searched, not the Preferred Language.
export interface EditionSection {
  language: string | null;
  matches: boolean;
  editions: EditionResult[];
}

// Newest first; `noIsbn` counts the Editions left out for having no ISBN.
// `sections`: the Editions the reader sees, by Preferred Language.
export interface EditionsFound {
  editions: EditionResult[];
  noIsbn: number;
  sections: EditionSection[];
}

// The Editions to show: in the Preferred Language, or "all".
export interface EditionsAsked {
  language: string;
  // The language of the title that matched the words (WorkResult `language`).
  matched?: string;
}

// A Wikidata or Inventaire entity: a Work or an Author.
export const isInventaireId = (id: string) => /^(?:wd:Q[1-9]\d*|inv:[0-9a-f]{32})$/.test(id);
// A BnF Work row: its Work authority, else a hash of its title and author.
export const isBnfWorkId = (id: string) => /^bnf:(?:\d{8,9}|t[0-9a-f]{12})$/.test(id);
// A Work identifier Search can open.
export const isWorkResultId = (id: string) => isInventaireId(id) || isBnfWorkId(id);

type Entity = {
  uri?: string;
  type?: string;
  labels?: Record<string, string>;
  aliases?: Record<string, string[]>;
  claims?: Record<string, unknown[]>;
};

const claims = (entity: Entity | undefined, property: string) =>
  (entity?.claims?.[property] ?? []).filter((value): value is string => typeof value === 'string');
const claim = (entity: Entity | undefined, property: string) => claims(entity, property)[0];
const label = (entity: Entity | undefined) => entity?.labels && (entity.labels.fr ?? entity.labels.en ?? Object.values(entity.labels)[0]);
const yearOf = (date: string | undefined) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);
const unique = <T>(values: T[]) => [...new Set(values)];

// Inventaire entities by URI, 50 per request; a requested URI that Inventaire
// redirects gets the entity it now names.
async function entities(fetch: SourceFetch, uris: string[]): Promise<Map<string, Entity>> {
  const found = new Map<string, Entity>();
  for (let i = 0; i < uris.length; i += 50) {
    const batch = uris.slice(i, i + 50);
    const response = await read(fetch, sourceUrls.inventaire(batch.join('|')));
    if (!response) continue;
    const body = (await response.json()) as { entities?: Record<string, Entity>; redirects?: Record<string, string> };
    for (const uri of batch) {
      const entity = body.entities?.[uri] ?? body.entities?.[body.redirects?.[uri] ?? ''];
      if (entity) found.set(uri, entity);
    }
  }
  return found;
}

// "en-gb" is English.
const primary = (language: string) => language.split('-')[0].toLowerCase();

// The title of the Work that holds every typed word, the shortest first, and
// its language (a label before an alias); else undefined, and the caller takes
// the label Inventaire gave in its answer.
function matchedTitle(words: string, work: Entity | undefined): { title: string; language: string } | undefined {
  const wanted = key(words).split(' ');
  const titles = [
    ...Object.entries(work?.labels ?? {}),
    ...Object.entries(work?.aliases ?? {}).flatMap(([language, aliases]) => aliases.map((alias): [string, string] => [language, alias])),
  ];
  const [language, title] =
    titles
      .filter(([, title]) => {
        const has = key(title).split(' ');
        return wanted.every((word) => has.includes(word));
      })
      .sort(([, a], [, b]) => key(a).length - key(b).length)[0] ?? [];
  return title && language ? { title, language: primary(language) } : undefined;
}

const titleKeys = (work: Entity | undefined) =>
  new Set([...Object.values(work?.labels ?? {}), ...Object.values(work?.aliases ?? {}).flat()].map(key));

const hasEveryWord = (words: string, names: string[]) => {
  const wanted = key(words).split(' ');
  return names.some((name) => {
    const has = key(name).split(' ');
    return wanted.every((word) => has.includes(word));
  });
};

const names = (entity: Entity | undefined) => [...Object.values(entity?.labels ?? {}), ...Object.values(entity?.aliases ?? {}).flat()];

// Inventaire first (Works and Authors, one call); when it finds nothing, BnF.
export async function find(fetch: SourceFetch, words: string): Promise<Found> {
  const response = await read(fetch, sourceUrls.inventaireSearch(words));
  const results = response ? (((await response.json()) as { results?: Hit[] }).results ?? []) : [];
  const hits = (type: string) => results.filter((each): each is Hit & { uri: string } => each.type === type && !!each.uri && isInventaireId(each.uri));
  const works = await workRows(fetch, hits('works'), (entity, shown) => {
    const matched = matchedTitle(words, entity);
    return { title: matched?.title ?? shown ?? label(entity), language: matched?.language ?? null };
  });
  await mergeShared(fetch, works.rows, works.entityOf);
  const authors = await authorRows(fetch, words, hits('humans'));
  if (works.rows.length > 0 || authors.length > 0) return { works: works.rows, authors };
  return { works: (await bnfGroups(fetch, words)).map(({ row }) => row), authors: [] };
}

type Hit = { uri?: string; type?: string; label?: string };

// Work rows for Inventaire Works, in their order, named by `titleOf`: the
// title, and its language when it holds the words.
async function workRows(
  fetch: SourceFetch,
  found: { uri: string; label?: string }[],
  titleOf: (work: Entity | undefined, shown?: string) => { title: string | undefined; language: string | null },
) {
  const works = await entities(fetch, found.map(({ uri }) => uri));
  const people = await entities(fetch, unique([...works.values()].flatMap((work) => claims(work, 'wdt:P50'))));
  const rows: WorkResult[] = [];
  const entityOf = new Map<string, Entity | undefined>();
  for (const { uri, label: shown } of found) {
    const entity = works.get(uri);
    const id = entity?.uri ?? uri;
    if (!isInventaireId(id) || rows.some((row) => row.id === id)) continue;
    const { title, language } = titleOf(entity, shown);
    if (!title) continue;
    const authors = claims(entity, 'wdt:P50').flatMap((author) => label(people.get(author)) ?? []);
    rows.push({ id, also: [], title, authors, year: yearOf(claim(entity, 'wdt:P577')), language });
    entityOf.set(id, entity);
  }
  return { rows, entityOf };
}

// An Author whose name holds every typed word, and who has a Work: "christie
// dix" names no Author. Their birth year tells apart two Authors of one name.
async function authorRows(fetch: SourceFetch, words: string, found: { uri: string }[]): Promise<AuthorResult[]> {
  const people = await entities(fetch, found.map(({ uri }) => uri));
  const rows: AuthorResult[] = [];
  for (const { uri } of found) {
    const person = people.get(uri);
    const id = person?.uri ?? uri;
    const name = label(person);
    if (!name || !isInventaireId(id) || rows.some((row) => row.id === id) || !hasEveryWord(words, names(person))) continue;
    const count = (await authorWorkList(fetch, id)).length;
    if (count > 0) rows.push({ id, name, birthYear: yearOf(claim(person, 'wdt:P569')), works: count });
  }
  return rows;
}

// Every Work of an Author in Inventaire (its Works that claim `wdt:P50`), by
// first publication year, newest first; the Works with no year last.
async function authorWorkList(fetch: SourceFetch, author: string): Promise<string[]> {
  const response = await read(fetch, sourceUrls.inventaireAuthorWorks(author));
  const works = response ? (((await response.json()) as { works?: { uri?: string; date?: string }[] }).works ?? []) : [];
  const dated = works
    .filter((each): each is { uri: string; date?: string } => !!each.uri && isInventaireId(each.uri))
    .map(({ uri, date }) => ({ uri, year: yearOf(date) ?? -Infinity }));
  return unique(dated.sort((a, b) => b.year - a.year).map(({ uri }) => uri));
}

// One page of the Works of an Author (`page` from 1).
export async function authorWorks(fetch: SourceFetch, author: string, page: number): Promise<AuthorWorks> {
  const all = await authorWorkList(fetch, author);
  const uris = all.slice((page - 1) * authorPageSize, page * authorPageSize);
  const { rows } = await workRows(fetch, uris.map((uri) => ({ uri })), (work) => ({ title: label(work), language: null }));
  return { works: rows, total: all.length };
}

// An Inventaire Work that may be a Wikidata Work of the results under another
// identifier (same Author, a title in common) joins it when they share an
// Edition ISBN; the row keeps the `wd:` identifier (ADR 0010: the best one).
// Only these pairs cost source calls, the same that open the Work later.
async function mergeShared(fetch: SourceFetch, rows: WorkResult[], entityOf: Map<string, Entity | undefined>): Promise<void> {
  for (const row of [...rows]) {
    if (!row.id.startsWith('inv:')) continue;
    const authors = claims(entityOf.get(row.id), 'wdt:P50');
    const keys = titleKeys(entityOf.get(row.id));
    const partner = rows.find(
      (other) =>
        other.id.startsWith('wd:') &&
        claims(entityOf.get(other.id), 'wdt:P50').some((author) => authors.includes(author)) &&
        [...titleKeys(entityOf.get(other.id))].some((title) => keys.has(title)),
    );
    if (!partner) continue;
    const ours = new Set((await inventaireEditions(fetch, row.id)).flatMap(({ isbn }) => isbn ?? []));
    const theirs = (await inventaireEditions(fetch, partner.id)).flatMap(({ isbn }) => isbn ?? []);
    if (!theirs.some((isbn) => ours.has(isbn))) continue;
    partner.also.push(row.id, ...row.also);
    rows.splice(rows.indexOf(row), 1);
  }
}

type Printed = Omit<EditionResult, 'isbn'> & { isbn: string | undefined };

// Inventaire gives the language as a Wikidata item; the app reads BnF codes.
const languages: Record<string, string> = {
  'wd:Q150': 'fre',
  'wd:Q1860': 'eng',
  'wd:Q1321': 'spa',
  'wd:Q652': 'ita',
  'wd:Q188': 'ger',
  'wd:Q5287': 'jpn',
  'wd:Q9176': 'kor',
  'wd:Q5146': 'por',
  'wd:Q7411': 'dut',
  'wd:Q7737': 'rus',
  'wd:Q256': 'tur',
};

const isbnOf = (isbn13: string | undefined, isbn10: string | undefined): string | undefined => {
  const thirteen = isbn13?.replace(/[\s-]/g, '');
  if (thirteen && isIsbn13(thirteen)) return thirteen;
  const ten = isbn10?.replace(/[\s-]/g, '').toUpperCase();
  return ten && /^\d{9}[\dX]$/.test(ten) ? isbn10To13(ten) : undefined;
};

// The Editions of a Work in Inventaire (`wdt:P629`), with their publisher and
// collection named.
async function inventaireEditions(fetch: SourceFetch, work: string): Promise<Printed[]> {
  const response = await read(fetch, sourceUrls.inventaireReverse('wdt:P629', work));
  const uris = response ? (((await response.json()) as { uris?: string[] }).uris ?? []) : [];
  const editions = [...(await entities(fetch, uris)).values()];
  const names = await entities(fetch, unique(editions.flatMap((each) => [...claims(each, 'wdt:P123'), ...claims(each, 'wdt:P195')])));
  const nameOf = (uri: string | undefined) => (uri && label(names.get(uri))) ?? null;
  return editions.flatMap((each) => {
    const title = claim(each, 'wdt:P1476') ?? label(each);
    if (!title) return [];
    return {
      isbn: isbnOf(claim(each, 'wdt:P212'), claim(each, 'wdt:P957')),
      title,
      year: yearOf(claim(each, 'wdt:P577')),
      publisher: nameOf(claim(each, 'wdt:P123')),
      collection: nameOf(claim(each, 'wdt:P195')),
      language: languages[claim(each, 'wdt:P407') ?? ''] ?? null,
    };
  });
}

// One BnF query, its records with a title. A record both queries give counts once.
async function bnfRecords(fetch: SourceFetch, query: string, seen: Set<string>): Promise<Printed[]> {
  const response = await read(fetch, sourceUrls.bnfQuery(query));
  if (!response) return [];
  return unimarcRecords(await response.text()).flatMap((record) => {
    const id = JSON.stringify(record);
    if (seen.has(id)) return [];
    seen.add(id);
    return printedOf(record) ?? [];
  });
}

function printedOf(record: UnimarcRecord): Printed | undefined {
  const title = subfield(record, '200', 'a');
  if (!title) return undefined;
  return {
    isbn: isbns(record).find(isIsbn13),
    title,
    year: publishedYear(record) ?? null,
    publisher: subfield(record, '214', 'c') ?? subfield(record, '210', 'c') ?? null,
    collection: subfield(record, '225', 'a') ?? null,
    language: subfield(record, '101', 'a') ?? null,
  };
}

// The first author of a BnF record (700 `$b $a`, "Agatha Christie"), else
// its statement of responsibility (200 `$f`).
function bnfAuthor(record: UnimarcRecord): string | undefined {
  const surname = subfield(record, '700', 'a');
  return surname ? [subfield(record, '700', 'b'), surname].filter(Boolean).join(' ') : subfield(record, '200', 'f');
}

const bnfFallbackRows = 20;

// When Inventaire finds nothing (ADR 0021): BnF records of printed text under
// the words, as title or author, grouped into Works by their Work authority
// (500 `$3`), else by title and author. BnF does not sort: the Works with an
// authority first, then the others, each in the order BnF gave.
async function bnfGroups(fetch: SourceFetch, words: string): Promise<{ row: WorkResult; records: UnimarcRecord[] }[]> {
  const typed = cql(words);
  if (!typed) return [];
  const response = await read(fetch, sourceUrls.bnfQuery(`(bib.title all "${typed}" or bib.author all "${typed}") and bib.doctype any "a"`));
  if (!response) return [];
  const groups = new Map<string, { row: WorkResult; records: UnimarcRecord[] }>();
  for (const record of unimarcRecords(await response.text())) {
    const title = subfield(record, '200', 'a');
    if (!title) continue;
    const author = bnfAuthor(record);
    const authority = /^\d{8,9}$/.exec(subfield(record, '500', '3') ?? '')?.[0];
    const id = authority ? `bnf:${authority}` : `bnf:t${createHash('sha256').update(`${key(title)}|${key(author ?? '')}`).digest('hex').slice(0, 12)}`;
    const group = groups.get(id) ?? {
      row: {
        id,
        also: [],
        title: (authority && subfield(record, '500', 'a')) || title,
        authors: author ? [author] : [],
        year: null,
        language: bcp47[subfield(record, '101', 'a') ?? ''] ?? null,
        words,
      },
      records: [],
    };
    const year = publishedYear(record);
    if (year && (group.row.year === null || year < group.row.year)) group.row.year = year;
    group.records.push(record);
    groups.set(id, group);
  }
  const all = [...groups.values()];
  return [...all.filter(({ row }) => !row.id.startsWith('bnf:t')), ...all.filter(({ row }) => row.id.startsWith('bnf:t'))].slice(0, bnfFallbackRows);
}

// A double quote would end the CQL string early.
const cql = (text: string) => text.replace(/["\\]/g, ' ').trim();

// The Editions BnF knows of the Work: by its Work authority (the Wikidata
// Work's BnF identifier, `wdt:P268`), and by its French title and Author,
// which finds the Editions with no Work link (2020 on for "Ils étaient dix").
// A query on title words alone brings noise: with no Author, no title query.
async function bnfEditions(fetch: SourceFetch, work: Entity, author: string | undefined): Promise<Printed[]> {
  const seen = new Set<string>();
  const authority = /^(\d{8})/.exec(claim(work, 'wdt:P268') ?? '')?.[1];
  const title = work.labels?.fr ?? label(work);
  const byAuthority = authority ? await bnfRecords(fetch, `bib.work2bib any "${authority}"`, seen) : [];
  const byTitle =
    title && author
      ? await bnfRecords(fetch, `bib.title adj "${cql(title)}" and bib.author all "${cql(author)}" and bib.doctype any "a"`, seen)
      : [];
  return [...byAuthority, ...byTitle];
}

// `ids`: the Work and the other identifiers of its row (WorkResult `also`);
// `words`: the words of a BnF row, whose search gives its records again.
export async function workEditions(fetch: SourceFetch, ids: string[], asked: EditionsAsked = { language: 'all' }, words?: string): Promise<EditionsFound> {
  if (isBnfWorkId(ids[0])) {
    const found = await bnfWorkEditions(fetch, ids[0], words ?? '');
    return { ...found, sections: sections(found.editions, {}, asked) };
  }
  const works = await entities(fetch, ids);
  const work = works.get(ids[0]);
  if (!work) return { editions: [], noIsbn: 0, sections: [] };
  const authorId = claim(work, 'wdt:P50');
  const author = authorId ? label((await entities(fetch, [authorId])).get(authorId)) : undefined;
  const fromInventaire: Printed[] = [];
  for (const id of ids) if (works.has(id)) fromInventaire.push(...(await inventaireEditions(fetch, id)));
  const fromBnf = await bnfEditions(fetch, work, author);
  const found = mergeByIsbn([...fromBnf, ...fromInventaire]);
  return { ...found, sections: sections(found.editions, work, asked) };
}

// The Editions in the Preferred Language; then, apart, those in the language of
// the words, unless the Work has the same label in both ("Dune"). "all": one list.
function sections(editions: EditionResult[], work: Entity, { language, matched }: EditionsAsked): EditionSection[] {
  if (language === 'all') return [{ language: null, matches: false, editions }];
  const inLanguage = (wanted: string) => editions.filter((each) => each.language && bcp47[each.language] === wanted);
  const labelIn = (wanted: string) =>
    Object.entries(work.labels ?? {})
      .filter(([each]) => primary(each) === wanted)
      .map(([, title]) => key(title));
  const sameLabel = (a: string, b: string) => labelIn(a).some((title) => labelIn(b).includes(title));
  const found: EditionSection[] = [{ language, matches: false, editions: inLanguage(language) }];
  if (matched && matched !== language && !sameLabel(matched, language)) {
    const other = inLanguage(matched);
    if (other.length > 0) found.push({ language: matched, matches: true, editions: other });
  }
  return found;
}

// A BnF row: its records in the search, and for a Work authority every record
// BnF links to it (`bib.work2bib`).
async function bnfWorkEditions(fetch: SourceFetch, id: string, words: string): Promise<Omit<EditionsFound, 'sections'>> {
  const group = (await bnfGroups(fetch, words)).find(({ row }) => row.id === id);
  if (!group) return { editions: [], noIsbn: 0 };
  const seen = new Set(group.records.map((record) => JSON.stringify(record)));
  const authority = /^bnf:(\d{8,9})$/.exec(id)?.[1];
  const linked = authority ? await bnfRecords(fetch, `bib.work2bib any "${authority}"`, seen) : [];
  return mergeByIsbn([...group.records.flatMap((record) => printedOf(record) ?? []), ...linked]);
}

// One Edition per ISBN-13, the year of its latest printing; the facts of its
// first source that has them, BnF first (the order of `printed`).
function mergeByIsbn(printed: Printed[]): Omit<EditionsFound, 'sections'> {
  const byIsbn = new Map<string, Printed[]>();
  let noIsbn = 0;
  for (const each of printed) {
    if (!each.isbn) noIsbn++;
    else byIsbn.set(each.isbn, [...(byIsbn.get(each.isbn) ?? []), each]);
  }
  const editions = [...byIsbn].map(([isbn, all]): EditionResult => {
    const latest = [...all].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const pick = <K extends keyof Printed>(field: K) => latest.map((each) => each[field]).find((value) => value !== null) ?? null;
    return {
      isbn,
      title: latest[0].title,
      year: latest[0].year,
      publisher: pick('publisher'),
      collection: pick('collection'),
      language: pick('language'),
    };
  });
  editions.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || (a.isbn < b.isbn ? -1 : 1));
  return { editions, noIsbn };
}

// Search answers kept 24 hours (ADR 0021), so the instance asks each source
// near once per query and day. `keep()` stores the answers of a call once it
// has every answer: a call with a source down stores nothing. Only answers
// and "unknown" (404) are kept; the table holds source data, no reader's.
const answerTtlMs = 24 * 3600 * 1000;

export function answerCache(db: DatabaseSync, fetch: SourceFetch, now: () => Date) {
  const fresh = (url: string) => {
    const row = db.prepare('select status, body, fetched_at from source_answer where url = ?').get(url) as
      | { status: number; body: string; fetched_at: string }
      | undefined;
    return row && now().getTime() - Date.parse(row.fetched_at) < answerTtlMs ? row : undefined;
  };
  const answers = new Map<string, { status: number; body: string }>();
  const cached: SourceFetch = async (url) => {
    const known = answers.get(url) ?? fresh(url);
    if (known) return new Response(known.status === 404 ? '' : known.body, { status: known.status });
    const response = await fetch(url);
    if (response.status !== 200 && response.status !== 404) return response;
    const body = await response.text();
    answers.set(url, { status: response.status, body });
    return new Response(response.status === 404 ? '' : body, { status: response.status });
  };
  function keep() {
    const at = now();
    inTransaction(db, () => {
      db.prepare('delete from source_answer where fetched_at < ?').run(new Date(at.getTime() - answerTtlMs).toISOString());
      const put = db.prepare('insert or replace into source_answer (url, status, body, fetched_at) values (?, ?, ?, ?)');
      for (const [url, { status, body }] of answers) put.run(url, status, body, at.toISOString());
    });
  }
  return { fetch: cached, keep };
}
