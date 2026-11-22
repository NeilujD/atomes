import { describe, expect, test } from 'vitest';
import {
  beforeDeploy,
  checkPr,
  entry,
  HIGHLIGHTS,
  nextVersion,
  type Pr,
  RELEASE_SUBJECT,
  releaseBody,
  releaseNotes,
  renderNotes,
  section,
  setPackageVersion,
} from './release';

const TEMPLATE_BODY = `## Summary
<!-- for reviewers -->
Adds a thing.

## Release notes
<!-- Text for readers. Write "none" to keep this PR out of the notes. -->
Each Volume shows its reading date.

\`\`\`sh
# a shell comment, not a heading
node scripts/invite.ts
\`\`\`

### Before you deploy

Set \`LEGAL_HOST\` in the production app.

## Testing
Ran it.
`;

const pr = (title: string, body = '', number: number | null = 7): Pr => ({
  title,
  body,
  number,
  url: number ? `https://github.com/o/r/pull/${number}` : null,
});

describe('section', () => {
  test('takes the text up to the next heading and skips code fences', () => {
    const notes = section(TEMPLATE_BODY, 'Release notes')!;
    expect(notes.startsWith('Each Volume shows its reading date.')).toBe(true);
    expect(notes).toContain('# a shell comment');
    expect(notes).not.toContain('Ran it');
    expect(notes).not.toContain('<!--');
  });

  test('a missing section is null', () => {
    expect(section('## Summary\nx', 'Release notes')).toBeNull();
  });

  test('nested comments cannot forge markers', () => {
    expect(section('## Release notes\nok <!<!-- x -->-- notes:end --> tail\n', 'Release notes')).toBe('ok  tail');
    expect(section('## Release notes\nok <!-- notes:end\n', 'Release notes')).toBe('ok &lt;!-- notes:end');
  });

  test('a heading inside a comment is not a heading', () => {
    expect(section('## Release notes\n<!--\n## Testing\n-->\nReal text\n', 'Release notes')).toBe('Real text');
  });
});

describe('checkPr', () => {
  test('valid titles', () => {
    for (const title of ['feat(M14): add x', 'fix(CORE-182): y', 'docs: z']) expect(checkPr(title, '')).toEqual([]);
    expect(checkPr('chore(release): v1.2.0', '', 'release/next')).toEqual([]);
  });

  test('the release title is only for the release branch of this repository', () => {
    expect(checkPr('chore(release): v9.0.0', '', 'my-branch')).not.toEqual([]);
    expect(checkPr('chore(release): v9.0.0', '', 'release/next', true)).not.toEqual([]);
  });

  test('the release subject is anchored', () => {
    expect(RELEASE_SUBJECT.exec('chore(release): v1.2.0 (#5)')?.[1]).toBe('1.2.0');
    expect(RELEASE_SUBJECT.exec('chore(release): v1.2.0 and more')).toBeNull();
  });

  test('bad format and unknown type', () => {
    expect(checkPr('M13 · Admin panel', '')).not.toEqual([]);
    expect(checkPr('feature: add x', '')).not.toEqual([]);
    expect(checkPr('feat:missing space', '')).not.toEqual([]);
  });

  test('a breaking change needs a Migration part', () => {
    expect(checkPr('feat!: drop x', '## Release notes\nGone.')).not.toEqual([]);
    expect(checkPr('feat!: drop x', '## Release notes\nGone.\n\n### Migration\n')).not.toEqual([]);
    expect(checkPr('feat!: drop x', '## Release notes\nGone.\n\n### Migration\nDo y.\n')).toEqual([]);
    expect(checkPr('feat: x', 'BREAKING CHANGE: removed y')).not.toEqual([]);
  });
});

describe('entry', () => {
  test('kinds', () => {
    expect(entry(pr('feat: a'))?.kind).toBe('new');
    expect(entry(pr('fix: a'))?.kind).toBe('fix');
    expect(entry(pr('perf: a'))?.kind).toBe('improvement');
    expect(entry(pr('refactor(x): a'))?.kind).toBe('improvement');
    expect(entry(pr('fix!: a'))?.kind).toBe('breaking');
  });

  test('types readers do not see stay out', () => {
    for (const title of ['docs: a', 'ci: a', 'chore: a', 'test: a', 'not conventional']) expect(entry(pr(title))).toBeNull();
  });

  test('"none" keeps the PR out; an empty part keeps the title only', () => {
    expect(entry(pr('fix: a', '## Release notes\nnone\n'))).toBeNull();
    expect(entry(pr('fix: a', '## Release notes\n<!-- hint -->\n', 3))?.markdown).toBe('### A ([#3](https://github.com/o/r/pull/3))');
  });

  test('the notes go under a heading made from the title, without the Before you deploy part', () => {
    const e = entry(pr('feat(M14): reading dates', TEMPLATE_BODY, 12))!;
    expect(e.kind).toBe('new');
    expect(e.markdown.startsWith('### Reading dates ([#12](https://github.com/o/r/pull/12))\n\nEach Volume')).toBe(true);
    expect(e.markdown).toContain('node scripts/invite.ts');
    expect(e.markdown).not.toContain('LEGAL_HOST');
  });

  test('a PR with only Before you deploy steps keeps its title', () => {
    expect(entry(pr('fix: a', '## Release notes\n### Before you deploy\nSet X.\n', 3))?.markdown).toBe(
      '### A ([#3](https://github.com/o/r/pull/3))',
    );
  });

  test('a direct push has no link', () => {
    expect(entry(pr('fix: crash', '', null))?.markdown).toBe('### Crash');
  });
});

describe('beforeDeploy', () => {
  test('takes the steps of any PR type under a heading from its title', () => {
    expect(beforeDeploy(pr('feat(M14): reading dates', TEMPLATE_BODY, 12))).toBe(
      '### Reading dates ([#12](https://github.com/o/r/pull/12))\n\nSet `LEGAL_HOST` in the production app.',
    );
    expect(beforeDeploy(pr('ci: new setting', '## Release notes\nnone\n\n### Before you deploy\nSet Y.', 4))).toBe(
      '### New setting ([#4](https://github.com/o/r/pull/4))\n\nSet Y.',
    );
  });

  test('no part, an empty part or "none" gives nothing', () => {
    expect(beforeDeploy(pr('feat: a', '## Release notes\nText.'))).toBeNull();
    expect(beforeDeploy(pr('feat: a', '## Release notes\n### Before you deploy\n<!-- hint -->\n'))).toBeNull();
    expect(beforeDeploy(pr('feat: a', '## Release notes\n### Before you deploy\nnone\n'))).toBeNull();
  });
});

describe('versions', () => {
  test('bumps', () => {
    expect(nextVersion('1.1.0', [])).toBeNull();
    expect(nextVersion('1.1.3', ['fix', 'improvement'])).toBe('1.1.4');
    expect(nextVersion('1.1.3', ['fix', 'new'])).toBe('1.2.0');
    expect(nextVersion('1.1.3', ['new', 'breaking'])).toBe('2.0.0');
  });

  test('package.json version', () => {
    const json = '{\n  "name": "atomes",\n  "private": true,\n  "version": "1.0.0",\n  "dependencies": { "x": "1.0.0" }\n}\n';
    expect(setPackageVersion(json, '1.1.0')).toBe(json.replace('"version": "1.0.0"', '"version": "1.1.0"'));
    expect(() => setPackageVersion('{}', '1.1.0')).toThrow();
  });
});

describe('notes', () => {
  test('sections in order, then the changelog link', () => {
    const entries = [
      { kind: 'fix' as const, markdown: '### F' },
      { kind: 'new' as const, markdown: '### N' },
      { kind: 'breaking' as const, markdown: '### B' },
    ];
    const notes = renderNotes('o/r', '1.1.0', '2.0.0', entries);
    expect(notes.indexOf('## Breaking changes')).toBeLessThan(notes.indexOf('## New'));
    expect(notes.indexOf('## New')).toBeLessThan(notes.indexOf('## Fixes'));
    expect(notes).not.toContain('## Improvements');
    expect(notes.endsWith('**Full changelog:** https://github.com/o/r/compare/v1.1.0...v2.0.0')).toBe(true);
  });

  test('the release PR body keeps the highlights; Before you deploy stays out of the notes', () => {
    const body = releaseBody('1.2.0', '', '## New\n\n### N', ['### A\n\nSet X.']);
    expect(body).toContain('## Before you deploy\n\nDo these steps on production **before** you merge:\n\n### A\n\nSet X.');
    const edited = body.replace(`${HIGHLIGHTS[0]}\n`, `${HIGHLIGHTS[0]}\nBig release.`);
    expect(releaseNotes(edited)).toBe('Big release.\n\n## New\n\n### N\n');
    expect(releaseNotes(body)).toBe('## New\n\n### N\n');
    expect(releaseBody('1.2.0', '', 'x', [])).toContain('## Before you deploy\n\nNothing to do.');
  });

  test('a body without markers fails', () => {
    expect(() => releaseNotes('plain body')).toThrow();
  });
});
