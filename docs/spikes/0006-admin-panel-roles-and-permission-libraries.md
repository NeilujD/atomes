# Spike: Admin panel roles and permission libraries

Linear: no ticket was given in the brief. Researched 2026-11-20. Versions, release dates, licences and dependencies come from the npm registry (`registry.npmjs.org`) on that date. Weekly downloads come from the npm downloads API for 2026-11-12 to 2026-11-18. Sizes come from the bundlephobia API (minified, then gzip). Stars, open issues, last push and archive state come from the GitHub API on that date. Docs and code were read at the head commit of each repo on that date; the commits are in "Method". Nothing was installed and no candidate code was run.

The repo today (read on `main` at `cdc825b`): Astro `^7.4.5` with `output: 'server'` and the Node adapter, `node:sqlite` with hand-written SQL and versioned migration steps (`src/lib/server/migrations.ts`), Preact islands, Bun as package manager. Sign-in is hand-written (ADR 0016): email Sign-in Code or AT Protocol OAuth, a session cookie, a `browser_session` table in `auth.sqlite`, and the `account` and `identity` tables in `library.sqlite`. `readerOf(request, deps)` in `src/lib/server/auth.ts` gives the Account of a request. There is no role today. ADR 0016 already rejected Better Auth: "It owns its user and session tables, and the code flow is small."

## TL;DR

No library fits better than a role table and one function. For one `admin` role, the libraries add little, and their own docs do not claim more.

- **Every in-process library only evaluates rules.** None stores a role in `node:sqlite` without an ORM. The role table, the grant from the panel and the grant from a script are ours to write with every candidate.
- **First choice: no library.** One `account_role` table in `library.sqlite`, one typed `can()` function, one check in each admin page and API route, one script like `scripts/invite.ts`. Mastodon, Lobsters and Gitea do it this way.
- **Fallback: `@casl/ability` 7.1.3** (MIT, 1 dependency, **6.9 kB** gzip, **2.87 M** downloads a week). It is the only library here that is small, active, widely used and silent on storage. Take it when a rule needs a condition on a record or on a field.
- **Better Auth `admin` does not fit**: it adds columns to its own `user` and `session` tables. Its `access` module is 150 lines of pure code inside a package with 17 dependencies.
- **Permit.io, Cerbos, OpenFGA and Oso Cloud need a second service** (a container or a hosted API). ADR 0007 says one Docker image.
- **Astro has no role feature.** Its docs say: do not authorize by matching `context.url.pathname`. So the check goes in each admin route, not in a path test in `src/middleware.ts`.

## Comparison

| Candidate | Version, release | Downloads / week | Licence | Weight | Stores roles? | Maintained | Fit for this stack |
|---|---|---|---|---|---|---|---|
| Hand-written: role table + `can()` | — | — | — | 0 packages | Yes: our table | Ours | **Fits. First choice** |
| [`@casl/ability`](https://www.npmjs.com/package/@casl/ability/v/7.1.3) | 7.1.3, 2026-11-13 | 2,865,380 | MIT | 1 dependency; [19.3 kB, **6.9 kB**](https://bundlephobia.com/package/@casl/ability@7.1.3) | No: evaluates rules | Yes: pushed 2026-11-19, 12 open issues | **Fits. Fallback** |
| [`better-auth`](https://www.npmjs.com/package/better-auth/v/1.7.26) `admin` plugin | 1.7.26, 2026-11-18 | 21,199,387 | MIT | 17 dependencies; 2.1 MB unpacked | Yes: in its own `user` table | Yes: pushed 2026-11-20, 427 open issues | **Does not fit**: owns users and sessions |
| `better-auth/plugins/access` alone | same | same | MIT | same package | No: evaluates rules | same | Works on paper; not worth the package |
| [`accesscontrol`](https://www.npmjs.com/package/accesscontrol/v/3.1.2) | 3.1.2, 2026-11-15 | 100,066 | MIT | 2 dependencies; [94.5 kB, **29.4 kB**](https://bundlephobia.com/package/accesscontrol@3.1.2) | No: in memory | Yes since 2026-06; none from 2018-02 to 2026-06 | Fits, but v3 is 5 months old |
| [`casbin`](https://www.npmjs.com/package/casbin/v/5.51.1) | 5.51.1, 2026-06-25 | 293,639 | Apache-2.0 | 5 dependencies; [152.1 kB, **40.6 kB**](https://bundlephobia.com/package/casbin@5.51.1) | Yes, through an adapter. None for `node:sqlite` | Yes: pushed 2026-11-19; package rename pending | Fits only with a hand-written adapter. Too much |
| [`permitio`](https://www.npmjs.com/package/permitio/v/2.7.7) (Permit.io) | 2.7.7, 2026-10-30 | 14,084 | MIT (SDK) | 9 dependencies + a PDP service | Yes: in Permit | Yes | **Does not fit**: hosted API or second container |
| [`@cerbos/grpc`](https://www.npmjs.com/package/@cerbos/grpc/v/0.29.4) (Cerbos) | 0.29.4, 2026-11-13 | 132,128 | Apache-2.0 | 2 dependencies + a PDP container | No: roles go in each request | Yes | **Does not fit**: second container |
| [`@openfga/sdk`](https://www.npmjs.com/package/@openfga/sdk/v/0.9.8) (OpenFGA) | 0.9.8, 2026-11-12 | 1,177,414 | Apache-2.0 | 4 dependencies + a server | Yes: in the server | Yes | **Does not fit**: second container |
| [`oso`](https://www.npmjs.com/package/oso/v/0.27.3) / [`oso-cloud`](https://www.npmjs.com/package/oso-cloud/v/2.7.0) | 0.27.3, 2024-01-13 / 2.7.0, 2026-10-26 | 10,114 / 204,251 | Apache-2.0 | library archived / hosted API | No / yes: in Oso Cloud | Library: no. Cloud: yes | **Does not fit** |
| [`@rbac/rbac`](https://www.npmjs.com/package/@rbac/rbac/v/3.0.0), now [`@rbac/core`](https://www.npmjs.com/package/@rbac/core/v/4.0.1) | 3.0.0 / 4.0.1, both 2026-11-14 | 2,601 / 602 | MIT | 1 / 0 dependencies | No: evaluates rules | Yes: pushed 2026-11-16 | Fits; little use, renamed 6 days ago |
| [`easy-rbac`](https://www.npmjs.com/package/easy-rbac/v/4.0.0) | 4.0.0, 2025-06-09 | 3,828 | MIT | 0 dependencies; [4.3 kB, **1.6 kB**](https://bundlephobia.com/package/easy-rbac@4.0.0) | No | Slow: last release 17 months ago | Fits; little use |
| [`rbac`](https://www.npmjs.com/package/rbac/v/6.0.0) (seeden) | 6.0.0, 2026-03-28 | 8,955 | MIT | 0 dependencies; [10.3 kB, **2.6 kB**](https://bundlephobia.com/package/rbac@6.0.0) | In memory, or a `Storage` class we write | Yes: 0 open issues | Fits; little use |
| [`role-acl`](https://www.npmjs.com/package/role-acl/v/4.5.4) | 4.5.4, 2020-04-29 | 9,075 | MIT | 5 dependencies; [66.7 kB, **16.9 kB**](https://bundlephobia.com/package/role-acl@4.5.4) | No | **No: repo archived** | Does not fit |
| [`permix`](https://www.npmjs.com/package/permix/v/4.4.1) | 4.4.1, 2026-10-30 | 35,345 | MIT | 0 dependencies; [3.5 kB, **1.5 kB**](https://bundlephobia.com/package/permix@4.4.1) | No | Yes; first release 2025-01-13 | Fits; young |
| Astro (middleware, `locals`, Actions, sessions) | [7.4.13](https://www.npmjs.com/package/astro/v/7.4.13), 2026-11-18 | — | MIT | already here | No role feature | Yes | The place of the check, not a role system |

- **Licences**: all are MIT or Apache-2.0. The FSF lists the Expat (MIT) licence as ["compatible with the GNU GPL"](https://www.gnu.org/licenses/license-list.html#:~:text=This%20is%20a%20lax%2C%20permissive%20non%2Dcopyleft%20free%20software%20license) and Apache 2.0 as ["compatible with version 3 of the GNU GPL"](https://www.gnu.org/licenses/license-list.html#:~:text=This%20is%20a%20free%20software%20license%2C%20compatible%20with%20version%203%20of%20the). The app is AGPL-3.0 (ADR 0006). That the same holds for AGPL-3.0 is this spike's reading, not a quote.
- **TypeScript**: all ship types except two that were not verified: `rbac` 6.0.0 has no `types` and no `exports` field in its `package.json`, and `role-acl` is archived.
- **Size on the server**: the gzip size matters only if the rules also run in a Preact island. On the server, count dependencies.

## 1. What each candidate is

### CASL (`@casl/ability`)

- It is a rule evaluator: you build an `Ability` from rules, then ask `can(action, subject)`. A rule has an action, a subject, optional fields and optional conditions ([intro](https://github.com/stalniy/casl/blob/b9ac87f/docs-src/src/content/pages/guide/intro/en.md)).
- **It stores nothing.** Its RBAC recipe says "we need to define tables for `users` and `roles`", and defines the permissions of each role in code ([roles with predefined permissions](https://github.com/stalniy/casl/blob/b9ac87f/docs-src/src/content/pages/cookbook/roles-with-static-permissions/en.md)). The recipe for permissions that admins edit puts a JSON column of rules in our own `roles` table ([roles with persisted permissions](https://github.com/stalniy/casl/blob/b9ac87f/docs-src/src/content/pages/cookbook/roles-with-persisted-permissions/en.md)). Both demos use SQLite through knex; nothing in CASL needs knex.
- A check by action and subject type is O(1) ([README](https://github.com/stalniy/casl/blob/b9ac87f/packages/casl-ability/README.md)).
- Version 7.0.0 (2026-05-21) broke the API: `PureAbility` became `Ability`, and the MongoDB-style conditions now come from `createMongoAbility`. Versions 7.1.1 (2026-10-31) and 7.1.3 (2026-11-13) are security fixes on subject type detection ([CHANGELOG](https://github.com/stalniy/casl/blob/b9ac87f/packages/casl-ability/CHANGELOG.md)). So it is maintained, and it is also code with its own security bugs in the path of every check.
- 7,118 stars. Created on npm 2018-02-22.

```ts
// Adapted from the README; not run.
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
function abilityFor(roles: string[]) {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  if (roles.includes('admin')) can('manage', 'all');
  return build();
}
abilityFor(roles).can('read', 'Invite'); // true or false
```

### Better Auth: the `admin` plugin and `access`

- The `admin` plugin lists users, sets roles, bans, and impersonates. ["An admin is any user assigned the `admin` role or any user whose ID is included in the `adminUserIds` option"](https://www.better-auth.com/docs/plugins/admin#:~:text=An%20admin%20is%20any%20user%20assigned%20the%20admin%20role%20or%20any%20user%20whose%20ID%20is%20included%20in%20the%20adminUserIds%20option). It has a CLI for the first admin: `npx auth@latest create-admin` (same page).
- **It cannot work without Better Auth owning users and sessions.** It adds `role`, `banned`, `banReason` and `banExpires` to the `user` table and `impersonatedBy` to the `session` table ([schema.ts](https://github.com/better-auth/better-auth/blob/3a7e13c/packages/better-auth/src/plugins/admin/schema.ts)). Better Auth ["requires the following tables to be present in the database"](https://www.better-auth.com/docs/concepts/database#:~:text=Better%20Auth%20requires%20the%20following%20tables%20to%20be%20present%20in%20the%20database): `user`, `session`, `account`, `verification`. Our `account`, `identity` and `browser_session` tables have other shapes.
- **`node:sqlite` is supported**: `database: new DatabaseSync("database.sqlite")`. The docs label it ["Release Candidate"](https://www.better-auth.com/docs/adapters/sqlite#:~:text=Release%20Candidate). It goes through Kysely, which is a dependency of the package.
- **The `access` module alone**: `better-auth/plugins/access` exports `createAccessControl(statement)` and `newRole()`. The file is about 150 lines, with one import (an error class) and no database ([access.ts](https://github.com/better-auth/better-auth/blob/3a7e13c/packages/better-auth/src/plugins/access/access.ts), last changed 2026-06-12). So it can be imported alone. The docs describe it only inside the admin and organization plugins. It checks a role against `{ resource: [actions] }`: no conditions, no fields. Installing 17 dependencies for it makes no sense.

```ts
// From the admin docs and access.ts; not run.
import { createAccessControl } from 'better-auth/plugins/access';
const ac = createAccessControl({ invite: ['list', 'cancel'] } as const);
const admin = ac.newRole({ invite: ['list', 'cancel'] });
admin.authorize({ invite: ['cancel'] }).success; // true
```

### `accesscontrol` (onury)

- **Maintenance**: 2.2.1 came out on 2018-02-24. The next release, 3.0.0, came out on 2026-06-24, then 3.1.0, 3.1.1 and 3.1.2 (2026-11-15). The repo was pushed on 2026-11-15 and has 1 open issue and 2,330 stars.
- Version 3 is a new engine: conditions, enforced ownership, custom actions, async checks, audit events. It is ESM only and needs Node 20 or later ([README](https://github.com/onury/accesscontrol/blob/3f2e1dd/README.md)).
- The 100,066 weekly downloads built up on version 2. Version 3 is 5 months old, and 3.1.2 fixes a fail-open in its IP conditions and a `.attributes()` setter that had no effect since 2.0.0 ([CHANGELOG](https://github.com/onury/accesscontrol/blob/3f2e1dd/CHANGELOG.md)). "Battle-tested" is the README's own word; the release history does not support it yet for v3.
- Storage: in memory. Grants load from an object or from rows we read ourselves.

```js
// From the README.
const ac = new AccessControl();
ac.grant('admin').readAny('account').deleteAny('invite');
ac.can('admin').deleteAny('invite').granted; // true
```

### Casbin (`casbin`)

- Casbin reads a model file (ACL, RBAC or ABAC) and a list of policy lines, then answers `enforce(subject, object, action)`. It does not do ["User or role list management — maintaining the list of users or roles"](https://casbin.apache.org/docs/overview#:~:text=maintaining%20the%20list%20of%20users%20or%20roles), but ["In RBAC mode, it does maintain user–role associations"](https://casbin.apache.org/docs/overview#:~:text=In%20RBAC%20mode%2C%20it%20does%20maintain%20user%E2%80%93role%20associations): the lines `g, alice, admin` live in its policy store.
- **No adapter for `node:sqlite`.** The Node.js adapters in the Casbin docs are: file and string (built in), Basic, Sequelize, TypeORM, Prisma, Drizzle, Knex, Objection.js, MikroORM, node-postgres and Mongoose ([adapters](https://casbin.apache.org/docs/adapters#:~:text=pg%2C%20mysql%2C%20mysql2%2C%20sqlite3%2C%20oracledb%2C%20mssql%20are%20supported%20by%20the%20adapter%20itself)). The Basic adapter takes the `sqlite3` driver, and `casbin-basic-adapter` 1.3.0 depends on `knex`. No package named for `node:sqlite` or `better-sqlite3` was found on npm: 5 guessed names all gave 404 ("Method"). An adapter under another name can exist.
- **A hand-written adapter is possible**: the `Adapter` interface has 5 async methods (`loadPolicy`, `savePolicy`, `addPolicy`, `removePolicy`, `removeFilteredPolicy`) ([adapter.ts](https://github.com/apache/casbin-node-casbin/blob/6e09e59/src/persist/adapter.ts)). Then our own code stores the roles again, in Casbin's table shape.
- **Project state**: Casbin is now an Apache Incubator project. The repo is `apache/casbin-node-casbin` (2,921 stars, pushed 2026-11-19). Its README says the next approved release will use the npm name `apache-casbin` in place of `casbin` ([README](https://github.com/apache/casbin-node-casbin/blob/6e09e59/README.md)). `apache-casbin` was not on npm on 2026-11-20. The last `casbin` release is 5 months old.

```js
// From the README; needs a model .conf file and a policy store.
const enforcer = await newEnforcer('rbac_model.conf', adapter);
await enforcer.enforce('alice', 'invite', 'cancel'); // true or false
await enforcer.getRolesForUser('alice');
```

### Services: Permit.io, Cerbos, OpenFGA, Oso

All four answer checks from a second process. Each check is a network call, and the app cannot start its admin panel without that process.

| Service | What runs beside the app | Where roles live | A check |
|---|---|---|---|
| Permit.io | The hosted Cloud PDP, or the `permitio/pdp-v2` container (it bundles OPA and OPAL), or the Nexus PDP container ([PDP overview](https://docs.permit.io/concepts/pdp/overview/)) | In Permit's API | `permit.check()` (arguments not read) |
| Cerbos | The `ghcr.io/cerbos/cerbos` container, on [ports 3592 and 3593](https://docs.cerbos.dev/cerbos/latest/installation/container.html#:~:text=the%20container%20is%20configured%20to%20listen%20on%20ports%203592%20%28HTTP%29%20and%203593%20%28gRPC%29), with policy files in YAML. It is [stateless](https://docs.cerbos.dev/cerbos/latest/index.html#:~:text=The%20open%2Dsource%20policy%20decision%20point) | In our database: the app sends `principal.roles` with each check | `await cerbos.isAllowed({ principal: { id, roles: ['USER'] }, resource, action: 'view' })` ([README](https://github.com/cerbos/cerbos-sdk-javascript/blob/b592a21/packages/grpc/README.md)) |
| OpenFGA | The `openfga/openfga` server on [ports 8080 and 8081](https://openfga.dev/docs/getting-started/setup-openfga/docker#:~:text=This%20will%20start%20an%20HTTP%20server%20and%20gRPC%20server%20with%20the%20default%20configuration%20options). Storage: memory (the default, lost at restart), Postgres, MySQL or SQLite ([configure](https://openfga.dev/docs/getting-started/setup-openfga/configure-openfga#:~:text=A%20memory%20storage%20engine%2C%20which%20is%20the%20default)) | In the server, as relationship tuples | `await fgaClient.check({ user: 'user:anne', relation: 'viewer', object: 'document:roadmap' })` ([README](https://github.com/openfga/js-sdk/blob/5b75def/README.md)) |
| Oso | Nothing to self-host. The open-source library is archived: ["It's no longer maintained"](https://github.com/osohq/oso/blob/5fefae1/README.md). [Oso Cloud is an authorization-as-a-service](https://www.osohq.com/docs/get-started/introduction#:~:text=Oso%20Cloud%20is%20an%20authorization%2Das%2Da%2Dservice) | In Oso Cloud | Not read |

- Permit's own docs say when not to use it: ["Don't use a PDP when you want checks in-process, with no separate service"](https://docs.permit.io/concepts/pdp/overview/#:~:text=Don%27t%20use%20a%20PDP%20when%20you%20want%20checks%20in%2Dprocess%2C%20with%20no%20separate%20service).
- Cerbos has an embedded PDP for Node (`@cerbos/embedded-client` 0.8.4), but it loads bundles ["generated by Cerbos Hub"](https://github.com/cerbos/cerbos-sdk-javascript/blob/b592a21/README.md), their hosted product. The older `@cerbos/embedded` is deprecated on npm.
- Cost for a one-container app: a second container to deploy, update, health-check and back up on Coolify (ADR 0007, ADR 0011), or account data sent to a hosted API, which the privacy notice must then name.

### Small RBAC libraries

| Package | A check | Note |
|---|---|---|
| `@rbac/core` 4.0.1 | `await auth.can('editor', 'posts:read')` | The README of [`phellipeandrade/rbac`](https://github.com/phellipeandrade/rbac/blob/c83e94a/README.md) now installs `@rbac/core`, created on npm on 2026-11-14. `@rbac/rbac` stops at 3.0.0. Optional adapters: MongoDB, MySQL, PostgreSQL. No SQLite. Needs Node 22.12.0 or later. 286 stars |
| `easy-rbac` 4.0.0 | A promise from `can`; roles are an object with `can` and `inherits` ([README](https://github.com/DeadAlready/easy-rbac/blob/a0e4536/README.md)) | 167 stars, 5 open issues |
| `rbac` 6.0.0 | `await rbac.can('admin', 'create', 'article')` ([README](https://github.com/seeden/rbac/blob/63faaea/README.md)) | "RBAC uses in-memory storage by default"; a custom `Storage` class has 8 async methods. 1,005 stars |
| `role-acl` 4.5.4 | — | [Repo archived](https://github.com/tensult/role-acl); last push 2020-11-15 |
| `permix` 4.4.1 | `permix.check('post.read')` ([README](https://github.com/letstri/permix/blob/f523d0a/README.md)) | Typed permissions, no roles concept in the README example. Needs Node 22. 643 stars |

Also seen on npm and not kept: `acl` 0.4.11 (last release 2017, depends on `mongodb` and `redis`), `acl2` 4.3.0 (1,652 downloads a week), `cancan` 3.1.0 (2017), `fast-rbac` 2.0.1 (2021), `accesscontrol-plus` 1.0.1 (2018), `virgen-acl` 0.0.22 (2017).

None of these is "usage-proven": the most used has 35,345 downloads a week, against 2.87 M for CASL. Each does what 10 lines of our own code do.

### Astro

- ["There is no official authentication solution for Astro"](https://docs.astro.build/en/guides/authentication/#:~:text=There%20is%20no%20official%20authentication%20solution%20for%20Astro). The authentication guide names Better Auth and Clerk. No page opened by this spike shows a role check.
- **Do not guard by path.** The authentication guide: ["Do not authorize requests by matching `context.url.pathname` against a string"](https://docs.astro.build/en/guides/authentication/#:~:text=Do%20not%20authorize%20requests%20by%20matching). The reason given: a configured `base`, URL encoding and duplicate slashes can make the pathname differ from the route Astro matches. The guide says to ["restrict access on a router that matches routes for you"](https://docs.astro.build/en/guides/authentication/#:~:text=restrict%20access%20on%20a%20router%20that%20matches%20routes%20for%20you), and shows Hono in `src/fetch.ts` (Astro's advanced routing). The routing guide repeats it for `src/fetch.ts`: ["Do not use pre-processing to authorize requests by matching the request pathname against a string"](https://docs.astro.build/en/guides/routing/#:~:text=Do%20not%20use%20pre%2Dprocessing%20to%20authorize%20requests%20by%20matching%20the%20request%20pathname%20against%20a%20string).
- **`locals`** carries data from middleware to pages and endpoints: ["useful for storing request-specific data, such as user data"](https://docs.astro.build/en/guides/middleware/#:~:text=This%20is%20useful%20for%20storing%20request%2Dspecific%20data%2C%20such%20as%20user%20data%2C%20across%20the%20rendering%20step). It is typed through `App.Locals` in `src/env.d.ts`.
- **Actions** are public endpoints: you must ["use the same authorization checks that you would consider for API endpoints and on-demand rendered pages"](https://docs.astro.build/en/guides/actions/#:~:text=use%20the%20same%20authorization%20checks%20that%20you%20would%20consider%20for%20API%20endpoints%20and%20on%2Ddemand%20rendered%20pages). ["Astro recommends authorizing user sessions from your action handler"](https://docs.astro.build/en/guides/actions/#:~:text=Astro%20recommends%20authorizing%20user%20sessions%20from%20your%20action%20handler), with `ActionError` codes such as `UNAUTHORIZED`. A gate in middleware is ["_not_ a substitute for secure authorization"](https://docs.astro.build/en/guides/actions/#:~:text=a%20substitute%20for%20secure%20authorization). The repo uses API routes, not Actions.
- **Sessions API** (since Astro 5.7.0): a server-side store ["to share data between requests"](https://docs.astro.build/en/guides/sessions/#:~:text=Sessions%20are%20used%20to%20share%20data%20between%20requests%20for). The Node adapter sets a default driver. It is not sign-in and has no roles. The app has its own session table, so it adds nothing here.
- `context.routePattern` (since 5.0.0) gives [the matched route pattern](https://docs.astro.build/en/reference/api-reference/#:~:text=The%20route%20pattern%20responsible%20for%20generating%20the%20current%20page%20or%20route). The docs do not say it is safe for authorization, so this spike does not propose it.

**For this repo**: put the check in the frontmatter of each admin page and at the top of each admin API handler. That code runs inside the matched route, so no path is compared. The repo has no `src/fetch.ts` and no Hono; adding a router for one panel is not needed.

## 2. What a library adds over a `role` column and one check

**For one `admin` role: little. No library's docs claim otherwise.**

- CASL describes itself as able to ["scale between a simple claim based and fully featured subject and attribute based authorization"](https://github.com/stalniy/casl/blob/b9ac87f/docs-src/src/content/pages/guide/intro/en.md). Its smallest RBAC recipe has 2 roles and still asks us to write the `users` and `roles` tables. With one role, `can('manage', 'all')` equals `role === 'admin'`.
- Casbin says it does not manage the list of users or roles (section 1). What it adds is a policy model in a file, role hierarchy, and a policy API at run time.
- `accesscontrol` adds attribute filtering, ownership and conditions (its README feature list). None applies to "may open the admin panel".
- Better Auth `admin` adds real features (ban, impersonate, list users, revoke sessions), but on its own tables.
- OWASP, on roles: ["In the beginning, a couple of simple roles, such as User and Admin, may suffice for some apps"](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html#:~:text=a%20couple%20of%20simple%20roles%2C%20such%20as%20User%20and%20Admin%2C%20may%20suffice%20for%20some%20apps), then it says this rarely stays true. Its rules apply with or without a library: ["Permission should be validated correctly on every request"](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html#:~:text=Permission%20should%20be%20validated%20correctly%20on%20every%20request), and ["explicit configuration should be preferred over relying on framework or library defaults"](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html#:~:text=explicit%20configuration%20should%20be%20preferred%20over%20relying%20on%20framework%20or%20library%20defaults).

**The hand-written way is the usage-proven one for self-hosted apps.**

- Mastodon: a role is a bitmask of permission flags in its own code (21 in its docs), such as ["View Audit Log"](https://docs.joinmastodon.org/entities/Role/#:~:text=Allows%20users%20to%20see%20history%20of%20admin%20actions) and ["Manage Invites"](https://docs.joinmastodon.org/entities/Role/#:~:text=Allows%20users%20to%20browse%20and%20deactivate%20invite%20links) ([`user_role.rb`](https://github.com/mastodon/mastodon/blob/1d888c3/app/models/user_role.rb)). Roles are granted from the panel and from the CLI: `tootctl accounts modify USERNAME --role ROLE` ([tootctl](https://docs.joinmastodon.org/admin/tootctl/#:~:text=Default%20roles%20include%20Owner%2C%20Admin%2C%20and%20Moderator)).
- Lobsters: two boolean columns, `is_admin` and `is_moderator`, on `users` ([schema.rb](https://github.com/lobsters/lobsters/blob/f519385/db/schema.rb)).
- Gitea: an `IsAdmin` boolean on the user ([user.go](https://github.com/go-gitea/gitea/blob/b2e54a7b187f4afc726bd19e6e9ea6d065d03322/models/user/user.go)), set from the CLI with [`--admin`](https://docs.gitea.com/administration/command-line#:~:text=If%20provided%2C%20this%20makes%20the%20user%20an%20admin).

**When a library starts to pay off** (this spike's judgment, from what each library adds):

| Need | Hand-written | Library |
|---|---|---|
| 1 to about 5 fixed roles, each a list of allowed actions | A typed map in code. Mastodon runs 21 flags this way | Not needed |
| A rule that depends on the record ("a moderator edits only Catalog entries they did not write") | `if` statements spread over handlers; OWASP warns that [chained role checks](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html#:~:text=multiple%20role%20checks%20must%20be%20chained%20to%20have%20the%20desired%20impact) get missed | CASL conditions |
| A rule on fields ("support sees the Account, not the email address") | Hand-picked columns per role | CASL fields, `accesscontrol` attributes |
| Permissions that an admin edits in the panel, with no deploy | A rules table and our own evaluator | CASL (JSON rules in a column) |
| The same rules on the server and in a Preact island | Two copies | CASL (6.9 kB gzip in the island) |
| Roles per group or tenant, or rights that follow relations between records | A real project | Casbin domains, OpenFGA |

The number of roles alone is not the trigger. The shape of the rules is: the first rule with a condition on a record or a field.

## 3. Recommendation

**First choice: no library. A role table, one `can()` function, a check in each admin route, and a script.**

1. **Table**: `account_role (account, role, granted_at, granted_by)` in `library.sqlite`, added by one migration step. `library.sqlite` is the file that is backed up (ADR 0016); `auth.sqlite` is not. A table, not a column on `account`, so a second role is a row and not a migration. `granted_by` is null for the script, as `invite.made_by` is.
2. **One function**: `can(roles, permission)` over a typed map `{ admin: [...] }` in one file. Every admin page and API route calls it with a named permission, never `role === 'admin'`. This is the seam: CASL can later replace the inside of `can()` with no change in the callers.
3. **The check on the server, in each route**: `readerOf(request, deps)`, then `can(...)`, in the frontmatter of each admin page and at the top of each admin API handler. Not a path test in `src/middleware.ts` (Astro docs, section 1). Today every app screen is gated in the browser, because the service worker keeps app screens (`src/lib/auth/session.ts`). The admin panel must be the exception: gated on the server, and never kept by the service worker.
4. **Read the role from the table on each admin request.** Do not copy it into `browser_session`: a revoked role then stops at the next request. The cost is one indexed read on a few pages.
5. **Script**: `scripts/role.ts grant|revoke <account or email> admin`, built like `scripts/invite.ts`. It is the only way to make the first admin. The panel must refuse to revoke the last admin.
6. **Audit table**: one row for each grant, revoke and other admin action (side topic A).

```ts
// Sketch only; not built, not run.
const grants = { admin: ['admin.open', 'role.grant', 'invite.list'] } as const;
export const can = (roles: Role[], permission: Permission) => roles.some((role) => grants[role].includes(permission));

// In each admin page and admin API route:
const reader = readerOf(request, deps);
if (!reader || !can(rolesOf(reader.account), 'admin.open')) return new Response(null, { status: 404 });
```

Reasons:

- Every candidate that runs in-process leaves the table, the panel grant and the script to us. The library would replace only the `can()` function, which is 1 line for one role.
- No candidate reads or writes `node:sqlite` without an ORM, except Better Auth through Kysely, on tables it owns.
- It follows ADR 0016 (hand-written flow, own tables) and ADR 0007 (one image).
- It is how Mastodon, Lobsters and Gitea do it.
- No new code in the path of every admin check. CASL shipped 2 security fixes in the last 3 weeks.

**Fallback: `@casl/ability`**, behind the same `can()` function, the day a rule needs a condition on a record or a field, or the rules must also run in an island. It is the one library here that is small, active, widely used, MIT, and says nothing about storage. Pin the version: 7.0.0 broke the API in May 2026.

**Not recommended**: Better Auth `admin` (owns users and sessions), Casbin (a policy file and a hand-written adapter for one role), `accesscontrol` (8 years without a release, then a new engine 5 months old), the four services (a second container or a hosted API), the small RBAC libraries (little use, nothing we cannot write in 10 lines).

## A. Abuse monitoring that keeps readers private

**The law**

- Pseudonymised data is personal data. GDPR recital 26: "Personal data which have undergone pseudonymisation, which could be attributed to a natural person by the use of additional information should be considered to be information on an identifiable natural person." The test is "all the means reasonably likely to be used, such as singling out, either by the controller or by another person" ([Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj), recital 26).
- Anonymous data is outside the GDPR. Same recital: the principles "should therefore not apply to anonymous information, namely information which does not relate to an identified or identifiable natural person or to personal data rendered anonymous in such a manner that the data subject is not or no longer identifiable".
- Article 4(5): "'pseudonymisation' means the processing of personal data in such a manner that the personal data can no longer be attributed to a specific data subject without the use of additional information, provided that such additional information is kept separately and is subject to technical and organisational measures".
- Pseudonymisation is still worth doing: it "can reduce the risks to the data subjects concerned" (recital 28), and article 32(1)(a) names "the pseudonymisation and encryption of personal data" as a security measure.
- The EDPB said the same in January 2025: pseudonymised data ["is therefore still personal data"](https://www.edpb.europa.eu/news/news/2025/edpb-adopts-pseudonymisation-guidelines-and-paves-way-improve-cooperation_en#:~:text=is%20therefore%20still%20personal%20data).

**CNIL**

- Anonymisation must ["rendre impossible, en pratique, toute identification de la personne"](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles#:~:text=rendre%20impossible%2C%20en%20pratique%2C%20toute%20identification%20de%20la%20personne), and for good. After pseudonymisation, ["les données concernées conservent donc un caractère personnel"](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles#:~:text=les%20donn%C3%A9es%20concern%C3%A9es%20conservent%20donc%20un%20caract%C3%A8re%20personnel).
- Three tests for an anonymous data set (same page): no singling out ([individualisation](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles#:~:text=il%20ne%20doit%20pas%20%C3%AAtre%20possible%20d%E2%80%99isoler%20un%20individu%20dans%20le%20jeu%20de%20donn%C3%A9es)), no linking of two data sets about one person (corrélation), no deducing new facts about a person (inférence).

**The patterns**

- **Aggregate counters** (sign-ups a day, Sign-in Codes sent, Invites made and used). The Article 29 Working Party: if the controller deletes the raw data and gives only "aggregate statistics ... on a high level", that "would qualify as anonymous data" ([Opinion 05/2014, WP216](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2014/wp216_en.pdf), section 2.2.2). On this instance the raw data stays (it is the Library), and with tens of Accounts a count of 1 is one person. So the counters are a way to show less to the admin, not a way out of the GDPR.
- **k-anonymity**: "Aggregation and K-anonymity techniques aim to prevent a data subject from being singled out by grouping them with, at least, k other individuals" (WP216, section 3.2.1). The opinion gives no value for k: "The higher the value of k, the stronger the privacy guarantees" (section 3.2.1.2). Hiding a count below a floor (5 or 10 are usual) is **common practice; no primary source was opened for a number**.
- **Pseudonymous ID = HMAC of the Account ID with a key.** WP216 calls this a "keyed-hash function with stored key": "A data controller can replay the function on the attribute using the secret key" (section 4). So it is pseudonymisation, and the data stays personal while the key exists. The opinion, in its executive summary: "pseudonymisation is not a method of anonymisation. It merely reduces the linkability of a dataset with the original identity of a data subject".
- **Rotating the key and deleting the old one** cuts the link between periods. WP216 describes a "keyed-hash function with deletion of the key" as equal to a random pseudonym whose table is deleted, and still lists it under pseudonymisation. A service that documents this pattern: Plausible, `hash(daily_salt + website_domain + ip_address + user_agent)`, where ["The salt is rotated and deleted every 24 hours"](https://plausible.io/data-policy#:~:text=The%20salt%20is%20rotated%20and%20deleted%20every%2024%20hours). **Whether such an ID is anonymous after the key is deleted is not settled by the texts read here**: inside one period the rows of one Account still link to each other.

**Audit log of admin actions (CNIL)**

- Log them: the security guide asks for logs of ["des interventions techniques (y compris par les administrateurs)"](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=des%20interventions%20techniques%20%28y%20compris%20par%20les%20administrateurs%29).
- What a row holds: ["l’identifiant de l’auteur, la date, l’heure et la nature de l’opération ainsi que la référence des données concernées"](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=en%20conservant%20l%E2%80%99identifiant%20de%20l%E2%80%99auteur%2C%20la%20date%2C%20l%E2%80%99heure%20et%20la%20nature%20de%20l%E2%80%99op%C3%A9ration%20ainsi%20que%20la%20r%C3%A9f%C3%A9rence%20des%20donn%C3%A9es%20concern%C3%A9es): a reference to the data, not a copy of it.
- How long: ["pour une durée comprise entre six mois et un an"](https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation#:~:text=pour%20une%20dur%C3%A9e%20comprise%20entre%20six%20mois%20et%20un%20an), on a rolling window. Never [without a time limit](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=Conserver%20les%20traces%20sans%20limite%20de%20dur%C3%A9e). When the source data lives [less than six months](https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation#:~:text=en%20cas%20de%20dur%C3%A9e%20de%20conservation%20des%20donn%C3%A9es%20sources%20inf%C3%A9rieure%20ou%20tr%C3%A8s%20inf%C3%A9rieure%20%C3%A0%20six%20mois), the log must not keep it longer: after an Account is deleted, its rows must not keep the email address.
- The log is personal data about the admins too: ["ces journaux contiennent également des données relatives aux utilisateurs habilités"](https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation#:~:text=ces%20journaux%20contiennent%20%C3%A9galement%20des%20donn%C3%A9es%20relatives%20aux%20utilisateurs%20habilit%C3%A9s). [Tell them](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=Informer%20les%20utilisateurs) that the log exists.
- Protect it from the people it records: ["en les rendant inaccessibles aux personnes dont l’activité est journalisée"](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=en%20les%20rendant%20inaccessibles%20aux%20personnes%20dont%20l%E2%80%99activit%C3%A9%20est%20journalis%C3%A9e). With one owner who is also the only admin and holds the server, this cannot be met in full. An append-only table with no delete in the panel is the part we can do.
- Use it only for security: any [other use](https://www.cnil.fr/fr/securite-tracer-les-operations#:~:text=Utiliser%20les%20informations%20issues%20des%20dispositifs%20de%20journalisation%20%C3%A0%20d%E2%80%99autres%20fins) is a misuse of purpose.
- OWASP agrees on the need: ["Logging is one of the most important detective controls in application security"](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html#:~:text=Logging%20is%20one%20of%20the%20most%20important%20detective%20controls%20in%20application%20security).

## B. Invite-abuse signals

| Signal | Source |
|---|---|
| **Invite tree: who invited whom** | Lobsters: ["The full user tree is public and each user's profile shows who invited them"](https://lobste.rs/about#:~:text=The%20full%20user%20tree%20is%20public%20and%20each%20user%27s%20profile). It ["helps identify voting rings"](https://lobste.rs/about#:~:text=helps%20identify%20voting%20rings). Its `users` table has `invited_by_user_id` ([schema.rb](https://github.com/lobsters/lobsters/blob/f519385/db/schema.rb)). The AT Protocol invite code has `createdBy`, `forAccount` and `uses[] { usedBy, usedAt }` ([`com.atproto.server.defs`](https://github.com/bluesky-social/atproto/blob/d9cdc54/lexicons/com/atproto/server/defs.json)) |
| **The inviter answers for the invited** | Lobsters: when an account is banned, ["moderators will consider disabling their inviter's ability to send invitations"](https://lobste.rs/about#:~:text=moderators%20will%20consider%20disabling%20their%20inviter%27s%20ability%20to%20send%20invitations) "or, rarely, also ban them" |
| **Accounts created per Invite maker** | The AT Protocol admin view sorts invite codes by `usage` ([`com.atproto.admin.getInviteCodes`](https://github.com/bluesky-social/atproto/blob/d9cdc54/lexicons/com/atproto/admin/getInviteCodes.json)). Mastodon lets a link have ["max uses"](https://docs.joinmastodon.org/user/contacts/#:~:text=you%20can%20set%20the%20max%20uses%20to%20limit%20how%20many%20times%20a%20certain%20link%20is%20used) and an expiry |
| **Admin actions on Invites** | AT Protocol: "Disable some set of codes and/or all codes associated with a set of users" ([`disableInviteCodes`](https://github.com/bluesky-social/atproto/blob/d9cdc54/lexicons/com/atproto/admin/disableInviteCodes.json)) and "Disable an account from receiving new invite codes, but does not invalidate existing codes" ([`disableAccountInvites`](https://github.com/bluesky-social/atproto/blob/d9cdc54/lexicons/com/atproto/admin/disableAccountInvites.json)). Mastodon: the "Manage Invites" permission ["Allows users to browse and deactivate invite links"](https://docs.joinmastodon.org/entities/Role/#:~:text=Allows%20users%20to%20browse%20and%20deactivate%20invite%20links) |
| **Inviters whose invited accounts cause trouble, again and again** | Tildes: its admin wrote in 2018 that the inviter is still stored and used "to see if someone is repeatedly inviting users that cause problems". **Seen in a search result only; the thread was not opened** |
| **Unused-Invite ratio** (made, never used, expired) | **Common practice; no primary source found** |
| **Accounts that never sign in again** after the first day | **Common practice; no primary source found** |
| **Many Accounts from one Invite maker in a short time** | **Common practice; no primary source found** |

**For this repo**: the limit is already strict. A reader invites one Account, ever, and has one open Invite at a time (ADR 0016, amended 2026-11-17). The script has no limit. The `invite` table holds `made_by`, `used_by`, `used_at` and `expires_at`, so the tree, the unused ratio and the count per maker are queries on data we already keep. "Never signs in again" needs a last sign-in date; whether the app keeps one was not checked. With one invited Account per reader, the tree is a chain: the useful signal is the chain of a bad Account, upward.

## Risks and open questions

- **One admin who is also the operator**: the audit log cannot be hidden from the person it records. Decide what the log is for (a record for a second admin later, or proof for readers).
- **The first admin**: only the script can make it. On Coolify that means `node scripts/role.ts` in the app Terminal, as for `scripts/invite.ts`. The script must run under Node with no Bun.
- **Revoke and open sessions**: with the role read on each admin request, a revoke is immediate. If the role is ever cached in the session, it is not.
- **Hide or refuse**: a 404 hides that the panel exists; a 403 is clearer for an admin whose role was revoked. Not decided here.
- **The admin panel and the service worker**: the service worker must not keep admin pages or admin API answers. Not checked in the service worker code.
- **What the admin sees**: the operator can already read every Library (ADR 0012). The panel makes it easy. The privacy notice should say what the panel shows.
- **CASL later**: 7.x is 6 months old and had 2 security fixes in 3 weeks. If it comes in, pin it and read each changelog.
- **Casbin**: do not start on `casbin` while the move to `apache-casbin` is open.

## Not verified

- No candidate was installed or run. Every code block is adapted from a README or docs page, or is a sketch.
- `better-auth/plugins/access` imported alone, with no Better Auth instance: read in the source, not run.
- Better Auth with `node:sqlite` on Node 22.23: stated in its docs, not run.
- TypeScript types of `rbac` 6.0.0 and `role-acl`.
- The arguments of `permit.check()`, and any Oso Cloud check.
- Prices and free tiers of Permit.io, Oso Cloud and Cerbos Hub.
- Whether `context.routePattern` is safe for authorization. The Astro docs do not say.
- Whether a redirect or a 404 returned from a shared admin layout works in Astro 7. The sketch puts the check in each page.
- The rendered CASL docs site (`casl.js.org`). The docs were read in the repo.
- The CNIL recommendation itself (deliberation of October 2021) and the full EDPB Guidelines 01/2025: only the CNIL and EDPB pages that present them were opened.
- WP216 was read through a rough text extraction of the PDF (no PDF tool on this machine). The quotes and the section numbers are in that text; the pages were not read as laid out.
- The Tildes statement in section B.
- Whether AGPL-3.0 changes anything in the FSF compatibility statements, which name the GPL.
- The Linear ticket of this work.

## Method

- **Tools**: the page-fetch tool was refused in this session. Pages were read as text with `curl` and Python from the hosts that own them, and repo files from `raw.githubusercontent.com`. Web search was used to find pages, and is the only source for the Tildes line. EUR-Lex answered with an empty page (HTTP 202) to a script, so the GDPR text was read from the EU Publications Office (`http://publications.europa.eu/resource/celex/32016R0679`, English); the links point to EUR-Lex.
- **npm**: `https://registry.npmjs.org/<package>` for version, date, licence, dependencies, `engines`, `deprecated`; `https://api.npmjs.org/downloads/point/last-week/<package>` for downloads. Names tried with no package: `apache-casbin`; for a SQLite adapter, `casbin-better-sqlite3-adapter`, `casbin-sqlite-adapter`, `casbin-sqlite3-adapter`, `casbin-node-sqlite-adapter`, `casbin-node-sqlite`; also `casbin-kysely-adapter`, `kysely-casbin-adapter`, `casbin-kysely`.
- **GitHub**: `https://api.github.com/repos/<repo>` for stars, open issues and pull requests together, last push and archive state. Open issues alone for CASL (12) and Better Auth (427) come from the search API.
- **Commits read** (the head of each default branch on 2026-11-20): `stalniy/casl` `b9ac87f`, `better-auth/better-auth` `3a7e13c`, `onury/accesscontrol` `3f2e1dd`, `apache/casbin-node-casbin` `6e09e59`, `node-casbin/basic-adapter` `13cac2b`, `phellipeandrade/rbac` `c83e94a`, `DeadAlready/easy-rbac` `a0e4536`, `seeden/rbac` `63faaea`, `letstri/permix` `f523d0a`, `osohq/oso` `5fefae1`, `cerbos/cerbos-sdk-javascript` `b592a21`, `openfga/js-sdk` `5b75def`, `permitio/permit-node` `b22aa4c`, `withastro/docs` `b605234`, `bluesky-social/atproto` `d9cdc54`, `mastodon/mastodon` `1d888c3`, `lobsters/lobsters` `f519385`, `go-gitea/gitea` `b2e54a7`, `OWASP/CheatSheetSeries` `c2a1e3e`.
- **Astro docs**: read in the `withastro/docs` repo, then the quoted sentences were checked on the rendered pages of `docs.astro.build`. The same check was done for the Better Auth and OWASP pages.
- **Repo files read**: `package.json`, `astro.config.*`, `src/middleware.ts`, `src/lib/auth/session.ts`, `src/lib/auth/invite.ts`, `src/lib/server/auth.ts`, `src/lib/server/migrations.ts`, `scripts/invite.ts`, `docs/adr/0006`, `docs/adr/0016`.
