import { describe, expect, test, vi } from 'vitest';
import { createChangelog, inline, parseNotes, parseReleases } from './changelog';
import answer from './changelog.fixture.json';

const titles = (group: { changes: { title: { text: string }[] }[] }) => group.changes.map((c) => c.title.map((p) => p.text).join(''));

describe('release notes', () => {
  test('each ## heading of scripts/release.ts is a category, in a fixed order; each ### is a change with its pull request', () => {
    const notes = parseNotes(`Intro line.

## Maintenance

### Docs ([#9](https://github.com/o/r/pull/9))

## Fixes

### Fix a ([#3](https://github.com/o/r/pull/3))

Text of a.

## New

### Add b ([#2](https://github.com/o/r/pull/2))

**Full changelog:** https://github.com/o/r/compare/v1.0.0...v1.1.0
`);
    expect(notes.intro).toEqual([{ kind: 'paragraph', parts: [{ kind: 'text', text: 'Intro line.' }] }]);
    expect(notes.groups.map((g) => g.category)).toEqual(['feature', 'fix', 'chore']);
    expect(notes.groups[1].changes[0]).toEqual({
      title: [{ kind: 'text', text: 'Fix a' }],
      pr: { number: 3, href: 'https://github.com/o/r/pull/3' },
      blocks: [{ kind: 'paragraph', parts: [{ kind: 'text', text: 'Text of a.' }] }],
    });
    // The compare link is dropped: the page links each Release.
    expect(JSON.stringify(notes)).not.toContain('compare');
  });

  test('the Migration part of a breaking change stays inside it', () => {
    const [group] = parseNotes('## Breaking changes\n\n### Rename x\n\nWhy.\n\n### Migration\n\n- Do `y`.\n').groups;
    expect(titles(group)).toEqual(['Rename x']);
    expect(group.changes[0].blocks.map((b) => b.kind)).toEqual(['paragraph', 'heading', 'list']);
  });

  test('a heading it does not know keeps its words, after the known ones', () => {
    const { groups } = parseNotes('## Thanks\n\n### Ada\n\n## New\n\n### B\n');
    expect(groups.map((g) => [g.category, g.heading])).toEqual([
      ['feature', 'New'],
      [null, 'Thanks'],
    ]);
  });

  test('the recorded Releases: newest first, every category of the sample', () => {
    const releases = parseReleases(answer);
    expect(releases.map((r) => r.version)).toEqual(['1.1.0', '1.0.0']);
    expect(releases[0].groups.map((g) => g.category)).toEqual(['breaking', 'feature', 'improvement', 'fix', 'chore']);
    expect(titles(releases[1].groups[0])).toContain('Your Library');
  });
});

describe('text parts', () => {
  test('code, bold and links; HTML stays text', () => {
    expect(inline('Use `x` **now**, see [docs](https://a.example/d) or https://b.example. <img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'now' },
      { kind: 'text', text: ', see ' },
      { kind: 'link', text: 'docs', href: 'https://a.example/d' },
      { kind: 'text', text: ' or ' },
      { kind: 'link', text: 'https://b.example', href: 'https://b.example' },
      { kind: 'text', text: '. <img src=x onerror=alert(1)>' },
    ]);
  });

  test('a link to anything but http or https stays text', () => {
    expect(inline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
  });
});

test('drafts and Releases not on github.com are left out', () => {
  const base = { tag_name: 'v1.0.0', published_at: '2026-11-23T09:14:30Z', html_url: 'https://github.com/o/r/releases/tag/v1.0.0', body: '' };
  expect(parseReleases([{ ...base, draft: true }, { ...base, html_url: 'javascript:alert(1)' }, { ...base, tag_name: 3 }])).toEqual([]);
  expect(parseReleases({ message: 'rate limited' })).toEqual([]);
});

describe('loading', () => {
  const ok = () => Promise.resolve(Response.json(answer));

  test('asks GitHub once while fresh, again after 10 minutes', async () => {
    const fetcher = vi.fn(ok);
    const releases = createChangelog(fetcher, 'Atomes/test');
    await releases(0);
    await releases(9 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await releases(10 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('a failure keeps the last Releases that loaded, and tries again a minute later', async () => {
    const fetcher = vi.fn(ok);
    const releases = createChangelog(fetcher, 'Atomes/test');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await releases(0)).toHaveLength(2);
    fetcher.mockImplementation(() => Promise.resolve(new Response('', { status: 403 })));
    expect(await releases(10 * 60_000)).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await releases(10 * 60_000 + 59_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('null when none ever loaded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const releases = createChangelog(() => Promise.reject(new Error('offline')), 'Atomes/test');
    expect(await releases(0)).toBeNull();
  });
});
