// Tells an agent, when its session starts, that the Linear ticket of this
// branch is blocked by a ticket that is not Done (docs/agents/issue-tracker.md).
// The SessionStart hook in .claude/settings.json runs it; what it prints goes
// into the agent's context. It never stops the session: when it cannot ask
// Linear, it says to check the blockers by hand.
//
// The Linear API key comes from LINEAR_API_KEY, or from the file named by
// LINEAR_API_KEY_FILE (Bun reads both from .env.local).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface Blocker {
  identifier: string;
  title: string;
  state: { name: string; type: string };
}

// A "blocked by" relation, as Linear gives it from the blocked side: `issue` is the blocker.
export interface InverseRelation {
  type: string;
  issue: Blocker;
}

// The ticket key in a branch name: Jean names branches like `linear-core-33-to-buy-list`.
export function ticketOf(branch: string): string | undefined {
  const number = /(?:^|[/-])core-(\d+)(?:-|$)/i.exec(branch)?.[1];
  return number === undefined ? undefined : `CORE-${number}`;
}

// A Done or Canceled blocker no longer blocks.
export function openBlockers(relations: InverseRelation[]): Blocker[] {
  return relations
    .filter(({ type, issue }) => type === 'blocks' && issue.state.type !== 'completed' && issue.state.type !== 'canceled')
    .map(({ issue }) => issue);
}

export function blockedNotice(ticket: string, blockers: Blocker[]): string | undefined {
  if (blockers.length === 0) return undefined;
  const list = blockers.map(({ identifier, title, state }) => `${identifier} "${title}" (${state.name})`).join(', ');
  return `STOP: ${ticket} is blocked by ${list}. Do not start work on ${ticket}. Tell the user, and ask whether to work on the blocker first.`;
}

const query = `query ($id: String!) {
  issue(id: $id) { inverseRelations { nodes { type issue { identifier title state { name type } } } } }
}`;

async function check(ticket: string): Promise<string | undefined> {
  const file = process.env.LINEAR_API_KEY_FILE;
  const key = process.env.LINEAR_API_KEY ?? (file ? readFileSync(file, 'utf8').trim() : undefined);
  if (!key) throw new Error('no LINEAR_API_KEY or LINEAR_API_KEY_FILE');
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: key },
    body: JSON.stringify({ query, variables: { id: ticket } }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as { data?: { issue?: { inverseRelations: { nodes: InverseRelation[] } } } };
  const relations = body.data?.issue?.inverseRelations.nodes;
  if (!relations) throw new Error(`Linear answered HTTP ${response.status} with no relations`);
  return blockedNotice(ticket, openBlockers(relations));
}

if (process.argv[1]?.endsWith('check-blockers.ts')) {
  const ticket = ticketOf(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim());
  if (ticket) {
    check(ticket)
      .then((notice) => notice && console.log(notice))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`Could not check the blockers of ${ticket} (${reason}). Check them in Linear before any work on ${ticket}.`);
      });
  }
}
