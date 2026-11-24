// Release automation: see "Releasing" in README.md. Node runs it in CI (type
// stripping), with git and the GitHub CLI.
//
//   node scripts/release.ts check-pr                 check PR_TITLE, PR_BODY, PR_HEAD, PR_FORK (env)
//   node scripts/release.ts prepare [--dry-run]      open or update the release PR from the merges since the last release
//   node scripts/release.ts publish-notes SHA FILE   write the notes of the merged release PR to FILE, print its version
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TYPES = new Set(['feat', 'fix', 'perf', 'refactor', 'docs', 'chore', 'ci', 'test', 'build', 'style', 'revert']);
const TITLE = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<bang>!)?: (?<desc>\S.*)$/;
type Kind = 'breaking' | 'new' | 'improvement' | 'fix' | 'chore';
// Every other known type is Maintenance: listed by title, with no version bump of its own.
const KIND_BY_TYPE: Partial<Record<string, Kind>> = { feat: 'new', fix: 'fix', perf: 'improvement', refactor: 'improvement' };
const SECTIONS: [Kind, string][] = [
  ['breaking', 'Breaking changes'],
  ['new', 'New'],
  ['improvement', 'Improvements'],
  ['fix', 'Fixes'],
  ['chore', 'Maintenance'],
];
const BUMP_INDEX: Record<Kind, number | null> = { breaking: 0, new: 1, improvement: 2, fix: 2, chore: null }; // major, minor, patch, none
const SKIP_NOTES = new Set(['none', 'n/a', '-']);

export const RELEASE_PREFIX = 'chore(release): v';
export const RELEASE_SUBJECT = /^chore\(release\): v(\d+\.\d+\.\d+)(?: \(#\d+\))?$/;
export const BRANCH = 'release/next';
const PRODUCTION = 'production';
export const HIGHLIGHTS = ['<!-- highlights:start -->', '<!-- highlights:end -->'] as const;
const NOTES = ['<!-- notes:start -->', '<!-- notes:end -->'] as const;

export interface Pr {
  number: number | null;
  url: string | null;
  title: string;
  body: string;
}
export interface Entry {
  kind: Kind;
  markdown: string;
}

// ---- pure logic (scripts/release.test.ts) ----

export function parseTitle(title: string) {
  const groups = TITLE.exec(title.trim())?.groups;
  return groups ? { type: groups.type, bang: Boolean(groups.bang), desc: groups.desc } : null;
}

/** Removes HTML comments, then neutralises any `<!--` left, so PR text cannot forge markers. */
function stripComments(text: string): string {
  let prev;
  do {
    prev = text;
    text = text.replace(/<!--[\s\S]*?-->/g, '');
  } while (prev !== text);
  return text.replaceAll('<!--', '&lt;!--').trim();
}

/** Splits `markdown` at the `level` heading named `heading`: the text under it, up to the next
 *  heading of that level or higher (`#` lines in code fences are not headings), or null if absent;
 *  and the text around it. */
function splitSection(markdown: string, heading: string, level: number) {
  const inside: string[] = [];
  const outside: string[] = [];
  let found = false;
  let done = false;
  let fenced = false;
  for (const line of stripComments(markdown).split('\n')) {
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    const match = fenced ? null : /^(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(line);
    if (match && match[1].length <= level && !done) {
      if (found) {
        done = true;
        outside.push(line);
      } else {
        found = match[1].length === level && match[2].toLowerCase() === heading.toLowerCase();
        if (!found) outside.push(line);
      }
      continue;
    }
    (found && !done ? inside : outside).push(line);
  }
  return { inside: found ? inside.join('\n').trim() : null, outside: outside.join('\n').trim() };
}

export function section(markdown: string, heading: string, level = 2): string | null {
  return splitSection(markdown, heading, level).inside;
}

function kindOf(title: string, body: string): Kind | null {
  const parsed = parseTitle(title);
  if (!parsed) return null;
  if (parsed.bang || /^BREAKING[ -]CHANGE:/m.test(body)) return 'breaking';
  return KIND_BY_TYPE[parsed.type] ?? (TYPES.has(parsed.type) ? 'chore' : null);
}

/** Errors for a PR title and body. Empty = valid. */
export function checkPr(title: string, body: string, head = '', fork = false): string[] {
  if (title.startsWith(RELEASE_PREFIX) && (head !== BRANCH || fork)) {
    return [`Only the release PR (branch ${BRANCH}) may use a "${RELEASE_PREFIX}" title.`];
  }
  const parsed = parseTitle(title);
  if (!parsed) {
    return [`Title "${title}" is not a Conventional Commit: use "type(scope): description", for example "feat(M14): …" or "fix(CORE-123): …".`];
  }
  if (!TYPES.has(parsed.type)) return [`Type "${parsed.type}" is unknown. Use one of: ${[...TYPES].sort().join(', ')}.`];
  if (kindOf(title, body) === 'breaking' && !section(section(body, 'Release notes') ?? '', 'Migration', 3)) {
    return ['Breaking change: add a "### Migration" part under "## Release notes" that tells readers and operators what to do.'];
  }
  return [];
}

function heading(pr: Pr): string {
  const desc = parseTitle(pr.title)?.desc ?? pr.title;
  const ref = pr.number ? ` ([#${pr.number}](${pr.url}))` : '';
  return `### ${desc[0].toUpperCase()}${desc.slice(1)}${ref}`;
}

/** The release notes entry of a merged PR, or null when it stays out of the notes. The
 *  "Before you deploy" part is for the operator: it stays out of the notes. */
export function entry(pr: Pr): Entry | null {
  const kind = kindOf(pr.title, pr.body);
  if (!kind) return null;
  const notes = splitSection(section(pr.body, 'Release notes') ?? '', 'Before you deploy', 3).outside;
  if (SKIP_NOTES.has(notes.toLowerCase())) {
    // Maintenance keeps its title: readers see no change, but the release lists it.
    if (kind === 'chore') return { kind, markdown: heading(pr) };
    if (kind !== 'breaking') return null;
  }
  return { kind, markdown: `${heading(pr)}\n\n${notes}`.trim() };
}

/** The "### Before you deploy" part of a merged PR, any type, under a heading from its title. */
export function beforeDeploy(pr: Pr): string | null {
  const steps = section(section(pr.body, 'Release notes') ?? '', 'Before you deploy', 3);
  if (!steps || SKIP_NOTES.has(steps.toLowerCase())) return null;
  return `${heading(pr)}\n\n${steps}`;
}

export function nextVersion(current: string, kinds: Kind[]): string | null {
  const bumps = kinds.map((kind) => BUMP_INDEX[kind]).filter((bump) => bump !== null);
  if (bumps.length === 0) return null;
  const parts = current.split('.').map(Number);
  const i = Math.min(...bumps);
  parts[i] += 1;
  parts.fill(0, i + 1);
  return parts.join('.');
}

export function renderNotes(repo: string, prev: string, version: string, entries: Entry[]): string {
  const out: string[] = [];
  for (const [kind, title] of SECTIONS) {
    const items = entries.filter((e) => e.kind === kind).map((e) => e.markdown);
    if (items.length > 0) out.push(`## ${title}\n\n${items.join('\n\n')}`);
  }
  out.push(`**Full changelog:** https://github.com/${repo}/compare/v${prev}...v${version}`);
  return out.join('\n\n');
}

function between(text: string, [startMarker, endMarker]: readonly [string, string]): string | null {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start < 0 || end < start) return null;
  return text.slice(start + startMarker.length, end).trim();
}

export function releaseBody(version: string, highlights: string, notes: string, steps: string[]): string {
  const before = steps.length > 0 ? `Do these steps on production **before** you merge:\n\n${steps.join('\n\n')}` : 'Nothing to do.';
  return `Merging this PR tags \`v${version}\`, publishes the GitHub Release with the notes below and deploys production: the publish job pushes this commit to the \`${PRODUCTION}\` branch, which the production Coolify app follows.

## Before you deploy

${before}

## Release notes

Write a one-line intro for the release between the highlights markers (optional). Edits there are kept; the rest of this body is made again after each merge to \`main\`.

${HIGHLIGHTS[0]}
${highlights}
${HIGHLIGHTS[1]}

---

${NOTES[0]}
${notes}
${NOTES[1]}
`;
}

/** The notes of the release PR body: the highlights, then the notes between their markers. */
export function releaseNotes(body: string): string {
  const notes = between(body, NOTES);
  if (notes === null) throw new Error('The release PR body has no notes markers.');
  const intro = stripComments(between(body, HIGHLIGHTS) ?? '');
  return intro ? `${intro}\n\n${notes}\n` : `${notes}\n`;
}

export function setPackageVersion(packageJson: string, version: string): string {
  const pattern = /^(\s*"version":\s*")[^"]*(")/m;
  if (!pattern.test(packageJson)) throw new Error('package.json: no "version" field.');
  return packageJson.replace(pattern, `$1${version}$2`);
}

// ---- git and GitHub ----

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

/** The version and ref of the last release: the newest release commit on HEAD, else the newest
 *  v* tag; null before the first release. */
function lastRelease(): { version: string; ref: string } | null {
  for (const line of run('git', ['log', '--first-parent', '--format=%H %s', 'HEAD']).split('\n')) {
    const [sha = '', ...subject] = line.split(' ');
    const match = RELEASE_SUBJECT.exec(subject.join(' '));
    if (match) return { version: match[1], ref: sha };
  }
  const tags = run('git', ['tag', '--list', 'v*', '--sort=-v:refname', '--merged', 'HEAD']).split('\n').filter(Boolean);
  return tags[0] ? { version: tags[0].slice(1), ref: tags[0] } : null;
}

interface GitHubPr {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string; repo: { full_name: string } | null };
}

function prForCommit(repo: string, sha: string): GitHubPr | null {
  const pulls = JSON.parse(run('gh', ['api', `repos/${repo}/commits/${sha}/pulls`])) as GitHubPr[];
  const merged = pulls.filter((p) => p.merge_commit_sha === sha);
  return (merged.length > 0 ? merged : pulls.filter((p) => p.merged_at))[0] ?? null;
}

function mergedPrs(repo: string, ref: string): Pr[] {
  const prs: Pr[] = [];
  for (const sha of run('git', ['log', '--reverse', '--format=%H', `${ref}..HEAD`]).split('\n').filter(Boolean)) {
    const pr = prForCommit(repo, sha);
    if (pr) {
      prs.push({ number: pr.number, url: pr.html_url, title: pr.title, body: pr.body ?? '' });
    } else {
      // A direct push: the commit message stands for the PR.
      const [title = '', ...body] = run('git', ['log', '-1', '--format=%B', sha]).split('\n');
      prs.push({ number: null, url: null, title, body: body.join('\n') });
    }
  }
  return prs.filter((p) => !p.title.startsWith(RELEASE_PREFIX));
}

function prepare(repo: string, dryRun: boolean): void {
  const last = lastRelease();
  if (!last) {
    console.log('No release yet: open the first release PR by hand (README, "Releasing").');
    return;
  }
  const prs = mergedPrs(repo, last.ref);
  const entries = prs.map(entry).filter((e) => e !== null);
  const version = nextVersion(
    last.version,
    entries.map((e) => e.kind),
  );
  if (!version) {
    console.log(`No release: nothing for readers merged since v${last.version}.`);
    return;
  }
  const notes = renderNotes(repo, last.version, version, entries);
  const steps = prs.map(beforeDeploy).filter((s) => s !== null);
  const existing = (
    JSON.parse(
      run('gh', ['pr', 'list', '--repo', repo, '--head', BRANCH, '--state', 'open', '--json', 'number,body,isCrossRepository']),
    ) as { number: number; body: string; isCrossRepository: boolean }[]
  ).filter((p) => !p.isCrossRepository);
  const highlights = existing[0] ? between(existing[0].body, HIGHLIGHTS) : null;
  const body = releaseBody(version, highlights ?? '', notes, steps);
  const title = `${RELEASE_PREFIX}${version}`;
  if (dryRun) {
    console.log(`${title}\n\n${body}`);
    return;
  }
  const packageJson = setPackageVersion(readFileSync('package.json', 'utf8'), version);
  run('git', ['checkout', '-B', BRANCH]);
  writeFileSync('package.json', packageJson);
  run('git', [
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '-am',
    title,
  ]);
  run('git', ['push', '--force', 'origin', BRANCH]);
  if (existing[0]) {
    run('gh', ['pr', 'edit', String(existing[0].number), '--repo', repo, '--title', title, '--body-file', '-'], body);
  } else {
    run('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', BRANCH, '--title', title, '--body-file', '-'], body);
  }
  console.log(`Release PR ready: ${title}`);
}

function publishNotes(repo: string, sha: string, path: string): void {
  const pr = prForCommit(repo, sha);
  if (!pr || pr.head.ref !== BRANCH || pr.head.repo?.full_name !== repo || !pr.title.startsWith(RELEASE_PREFIX)) {
    throw new Error(`${sha} is not a merged release PR from ${BRANCH}.`);
  }
  writeFileSync(path, releaseNotes(pr.body ?? ''));
  console.log(/v(\d+\.\d+\.\d+)/.exec(pr.title)![1]);
}

function main(args: string[]): number {
  const repo = process.env.GITHUB_REPOSITORY ?? 'NeilujD/atomes';
  const [command] = args;
  if (command === 'check-pr') {
    const { PR_TITLE = '', PR_BODY = '', PR_HEAD = '', PR_FORK } = process.env;
    const errors = checkPr(PR_TITLE, PR_BODY, PR_HEAD, PR_FORK === 'true');
    for (const error of errors) console.log(`::error::${error}`);
    return errors.length > 0 ? 1 : 0;
  }
  if (command === 'prepare') {
    prepare(repo, args.includes('--dry-run'));
    return 0;
  }
  if (command === 'publish-notes' && args.length === 3) {
    publishNotes(repo, args[1], args[2]);
    return 0;
  }
  console.error('Usage: node scripts/release.ts check-pr | prepare [--dry-run] | publish-notes SHA FILE');
  return 2;
}

if (process.argv[1]?.endsWith('release.ts')) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
