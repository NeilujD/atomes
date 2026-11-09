// A minimal S3 client: PUT and GET of one object, signed with AWS Signature
// Version 4 (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
// Cloudflare R2 takes it with the region `auto`
// (https://developers.cloudflare.com/r2/api/s3/api/#bucket-region).
import { createHash, createHmac } from 'node:crypto';
import type { Store } from './backup';

export type S3Settings = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

type S3Fetch = (url: URL, init: RequestInit) => Promise<Response>;

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

// Returns the headers to send: the given ones plus the x-amz-* and
// authorization headers. `host` is signed but not returned: fetch sets it.
export function signS3Request(request: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Uint8Array | null;
  credentials: { accessKeyId: string; secretAccessKey: string };
  region: string;
  now: Date;
}): Record<string, string> {
  const amzDate = request.now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${request.region}/s3/aws4_request`;
  const headers: Record<string, string> = {
    ...request.headers,
    'x-amz-content-sha256': sha256(request.body ?? ''),
    'x-amz-date': amzDate,
  };
  const signed = { ...headers, host: request.url.host };
  const names = Object.keys(signed)
    .map((name) => name.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(signed).map(([name, value]) => [name.toLowerCase(), value.trim()]));
  const canonical = [
    request.method,
    request.url.pathname,
    '',
    ...names.map((name) => `${name}:${lower[name]}`),
    '',
    names.join(';'),
    headers['x-amz-content-sha256'],
  ].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = ['s3', 'aws4_request'].reduce(
    (key, part) => hmac(key, part),
    hmac(hmac(`AWS4${request.credentials.secretAccessKey}`, day), request.region),
  );
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${request.credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

// Object names are made of [A-Za-z0-9.-] and "/", so the path needs no encoding.
export function s3Store(settings: S3Settings, fetch: S3Fetch = globalThis.fetch): Store {
  async function send(method: 'GET' | 'PUT', name: string, body: Uint8Array | null) {
    const url = new URL(`${settings.endpoint.replace(/\/+$/, '')}/${settings.bucket}/${name}`);
    const headers = signS3Request({
      method,
      url,
      headers: {},
      body,
      credentials: settings,
      region: settings.region ?? 'auto',
      now: new Date(),
    });
    const response = await fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
    if (response.ok || (method === 'GET' && response.status === 404)) return response;
    throw new Error(`S3 ${method} ${name}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  }

  return {
    async put(name, body) {
      await send('PUT', name, body);
    },
    async get(name) {
      const response = await send('GET', name, null);
      return response.status === 404 ? null : new Uint8Array(await response.arrayBuffer());
    },
  };
}
