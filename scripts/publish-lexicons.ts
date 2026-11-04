// Publishes every lexicon in `lexicons/` as a `com.atproto.lexicon.schema`
// record in the repo that `_lexicon.atomes.app` (DNS TXT) points to, so a PDS
// can resolve `app.atomes.*` (needed for the Space OAuth scope).
// Run it again after every lexicon change; changes must stay backward compatible.
//
// Usage: LEXICON_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx bun scripts/publish-lexicons.ts
// The app password belongs to the owner's main account. Never commit it.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The owner's main account (neilujd.bsky.social), not the alpha account.
const did = 'did:plc:zqiqz76wf24fttlb2r73evli';
const pds = 'https://puffball.us-east.host.bsky.network';
const lexiconDir = 'lexicons';

const password = process.env.LEXICON_APP_PASSWORD;
if (!password) throw new Error('Set LEXICON_APP_PASSWORD to an app password of the owner account.');

async function xrpc(method: string, body: unknown, accessJwt?: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${pds}/xrpc/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(accessJwt && { authorization: `Bearer ${accessJwt}` }) },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const files = (await readdir(lexiconDir, { recursive: true })).filter((file) => file.endsWith('.json')).sort();
const { accessJwt } = (await xrpc('com.atproto.server.createSession', { identifier: did, password })) as {
  accessJwt: string;
};

for (const file of files) {
  const lexicon = JSON.parse(await readFile(join(lexiconDir, file), 'utf8')) as { id: string };
  // lexicons/app/atomes/library.json must hold app.atomes.library.
  const expectedId = file.replace(/\.json$/, '').split(/[\\/]/).join('.');
  if (lexicon.id !== expectedId) throw new Error(`${file}: id is ${lexicon.id}, expected ${expectedId}`);

  await xrpc(
    'com.atproto.repo.putRecord',
    {
      repo: did,
      collection: 'com.atproto.lexicon.schema',
      rkey: lexicon.id,
      record: { $type: 'com.atproto.lexicon.schema', ...lexicon },
    },
    accessJwt,
  );
  console.log(`Published ${lexicon.id}`);
}
