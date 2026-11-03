# Issue tracker: Linear

Issues and specs for this repo live in Linear, team `CORE`.

## Access

- Use the Linear MCP connector to read and write issues when it is authorized (`/mcp`).
- If it is not, use the Linear GraphQL API (`https://api.linear.app/graphql`) with the API key saved in Jean's settings. Never print, log or commit the key.
- If neither works, stop and tell the user; do not fall back to local files.
- Jean `list_linear_issues` can list issues read-only.
- No Linear CLI.

## Conventions

- One Linear project, `atomes`. Each build-guide phase adds project milestones; each milestone is a gate you can check (e.g. "M1 · Signed in").
- The spec of the current phase is the project content (description body).
- Implementation tickets are issues in that project, each in one milestone, one issue per ticket, never one combined issue.
- Triage state is a Linear label (see `triage-labels.md`).
- Blocking uses Linear "blocked by" relations.
- Comments and conversation history are Linear issue comments.
- Branch names include the Linear issue key (e.g. `CORE-12`).

## When a skill says "publish to the issue tracker"

Create the project (if missing) and issues in team `CORE` through the Linear MCP.

## When a skill says "fetch the relevant ticket"

Fetch the Linear issue by key (e.g. `CORE-12`). The user normally passes the key or URL.

## Wayfinding operations

Used by `/wayfinder`.

- **Map**: the Linear project description (Notes / Decisions-so-far / Fog).
- **Child ticket**: an issue in the project, with the question in the body. A label or the first body line records the type (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: Linear "blocked by" relations. A ticket is unblocked when every blocker is Done.
- **Frontier**: open, unblocked, unassigned issues in the project; lowest issue number wins.
- **Claim**: assign to yourself and set "In Progress" before any work.
- **Resolve**: post the answer as a comment, set "Done", then append a gist + link to Decisions-so-far in the project description.
