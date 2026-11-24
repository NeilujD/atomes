// What's new (/changelog): the GitHub Releases of Atomes, read from the GitHub
// API and cut into categories. `scripts/release.ts` writes each Release body:
// a `##` heading per category, a `###` heading per change from its pull request
// title, then the release notes of that pull request.
//
// Release bodies come from pull request bodies, which anyone can write: the
// text is parsed into plain parts (text, code, bold, links), never HTML, and a
// link keeps only an http or https address.
import { sourceCodeUrl } from '../source-code';

export type Category = 'breaking' | 'feature' | 'improvement' | 'fix' | 'chore';
export const categories: readonly Category[] = ['breaking', 'feature', 'improvement', 'fix', 'chore'];
// The `##` headings of `scripts/release.ts` (SECTIONS).
const CATEGORY_BY_HEADING: Record<string, Category> = {
  'breaking changes': 'breaking',
  new: 'feature',
  improvements: 'improvement',
  fixes: 'fix',
  maintenance: 'chore',
};

export type Inline = { kind: 'text' | 'code' | 'strong'; text: string } | { kind: 'link'; text: string; href: string };
export type Block = { kind: 'paragraph'; parts: Inline[] } | { kind: 'list'; items: Inline[][] } | { kind: 'heading'; parts: Inline[] };
export interface Change {
  title: Inline[];
  pr: { number: number; href: string } | null;
  blocks: Block[];
}
// A heading the parser does not know keeps its own words, after the known ones.
export interface Group {
  category: Category | null;
  heading: string;
  changes: Change[];
}
export interface Release {
  version: string;
  date: string;
  url: string;
  intro: Block[];
  groups: Group[];
}

// `code`, **bold**, [text](https://…), ![image](https://…) (kept as a link), a
// bare https://… address (without the full stop or comma after it).
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|!?\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) });
    const [, code, strong, label, href, bare] = match;
    if (code !== undefined) parts.push({ kind: 'code', text: code });
    else if (strong !== undefined) parts.push({ kind: 'strong', text: strong });
    else if (href !== undefined) parts.push({ kind: 'link', text: label || href, href });
    else parts.push({ kind: 'link', text: bare, href: bare });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

// Paragraphs, lists and sub-headings ("### Migration") of Markdown text.
function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length > 0) out.push({ kind: 'paragraph', parts: inline(paragraph.join(' ')) });
    if (list) out.push({ kind: 'list', items: list.map(inline) });
    paragraph = [];
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const item = LIST_ITEM.exec(raw);
    const heading = /^#{3,6}\s+(.*)$/.exec(line);
    if (!line || line.startsWith('```')) flush();
    else if (heading) {
      flush();
      out.push({ kind: 'heading', parts: inline(heading[1]) });
    } else if (item) {
      if (paragraph.length > 0) flush();
      (list ??= []).push(item[1]);
    } else if (list && /^\s+/.test(raw)) list[list.length - 1] += ` ${line}`;
    else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out;
}

// "Title ([#12](https://github.com/…/pull/12))": the title, and its pull request.
const CHANGE_HEADING = /^(.*?)\s*\(\[#(\d+)\]\((https:\/\/[^)\s]+)\)\)$/;

function change(heading: string, lines: string[]): Change {
  const match = CHANGE_HEADING.exec(heading);
  return {
    title: inline(match ? match[1] : heading),
    pr: match ? { number: Number(match[2]), href: match[3] } : null,
    blocks: blocks(lines),
  };
}

// The intro (text before the first `##`), then one group per `##` heading, in
// the order of `categories`; each `###` under it is a change, except a
// "Migration" part, which stays inside the change it follows.
export function parseNotes(body: string): { intro: Block[]; groups: Group[] } {
  const intro: string[] = [];
  const groups: (Group & { open?: { heading: string; lines: string[] } })[] = [];
  let fenced = false;
  const close = (group: (typeof groups)[number] | undefined) => {
    if (group?.open) group.changes.push(change(group.open.heading, group.open.lines));
    if (group) delete group.open;
  };
  for (const line of body.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    // The compare link at the end: the page links each Release instead.
    if (!fenced && /^\*\*Full changelog:\*\*/i.test(line.trim())) continue;
    const h2 = fenced ? null : /^##\s+(.*?)\s*$/.exec(line);
    const h3 = fenced ? null : /^###\s+(.*?)\s*$/.exec(line);
    const group = groups.at(-1);
    if (h2) {
      close(group);
      groups.push({ category: CATEGORY_BY_HEADING[h2[1].toLowerCase()] ?? null, heading: h2[1], changes: [] });
    } else if (h3 && group && h3[1].toLowerCase() !== 'migration') {
      close(group);
      group.open = { heading: h3[1], lines: [] };
    } else if (group) {
      (group.open ??= { heading: '', lines: [] }).lines.push(line);
    } else intro.push(line);
  }
  close(groups.at(-1));
  const rank = (group: Group) => (group.category ? categories.indexOf(group.category) : categories.length);
  return {
    intro: blocks(intro),
    groups: groups
      .map(({ category, heading, changes }) => ({ category, heading, changes: changes.filter((c) => c.title.length > 0 || c.blocks.length > 0) }))
      .filter((group) => group.changes.length > 0)
      .sort((a, b) => rank(a) - rank(b)),
  };
}

interface GitHubRelease {
  tag_name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  draft?: unknown;
}

// The Releases of a GitHub API answer, newest first; drafts and anything
// malformed are left out.
export function parseReleases(answer: unknown): Release[] {
  if (!Array.isArray(answer)) return [];
  return (answer as GitHubRelease[])
    .filter(
      (r) =>
        !r.draft &&
        typeof r.tag_name === 'string' &&
        typeof r.published_at === 'string' &&
        typeof r.html_url === 'string' &&
        r.html_url.startsWith('https://github.com/'),
    )
    .map((r) => ({
      version: (r.tag_name as string).replace(/^v/, ''),
      date: r.published_at as string,
      url: r.html_url as string,
      ...parseNotes(typeof r.body === 'string' ? r.body : ''),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const repo = new URL(sourceCodeUrl).pathname.slice(1);
export const releasesUrl = `${sourceCodeUrl}/releases`;
const API = `https://api.github.com/repos/${repo}/releases?per_page=30`;
// Each server asks GitHub at most every 10 minutes (60 requests an hour per
// address without a token); after a failure, again in a minute.
const FRESH_MS = 10 * 60_000;
const RETRY_MS = 60_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// The Releases, from memory while fresh; on a failure the last ones that
// loaded, or null when none ever did.
export function createChangelog(fetcher: Fetch, userAgent: string) {
  let kept: Release[] | null = null;
  let until = 0;
  let pending: Promise<Release[] | null> | undefined;
  const load = async (now: number) => {
    try {
      const response = await fetcher(API, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      kept = parseReleases(await response.json());
      until = now + FRESH_MS;
    } catch (error) {
      console.warn(`What's new: the GitHub Releases did not load: ${error instanceof Error ? error.message : String(error)}`);
      until = now + RETRY_MS;
    }
    return kept;
  };
  return (now = Date.now()): Promise<Release[] | null> => {
    if (now < until) return Promise.resolve(kept);
    pending ??= load(now).finally(() => (pending = undefined));
    return pending;
  };
}

// Development only, with CHANGELOG_SOURCE=recorded (E2E, agent tests): the
// recorded answer of `changelog.fake.ts`, with no network. The build drops it.
const recorded =
  import.meta.env.DEV && process.env.CHANGELOG_SOURCE === 'recorded' ? (await import('./changelog.fake')).recordedFetch : undefined;

let instance: ReturnType<typeof createChangelog> | undefined;

export function changelog(userAgent: string): ReturnType<typeof createChangelog> {
  instance ??= createChangelog(recorded ?? fetch, userAgent);
  return instance;
}
