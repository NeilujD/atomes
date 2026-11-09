import { describe, expect, test } from 'vitest';
import { s3Store, signS3Request } from './s3';

// The "GET Object" example of the AWS Signature Version 4 documentation
// (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
test('signs the AWS documentation example to the published signature', () => {
  const headers = signS3Request({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { range: 'bytes=0-9' },
    body: null,
    credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    region: 'us-east-1',
    now: new Date('2013-05-24T00:00:00Z'),
  });

  expect(headers.authorization).toBe(
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

describe('s3Store', () => {
  const settings = {
    endpoint: 'https://account.r2.cloudflarestorage.com/',
    bucket: 'atomes-backups',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
  };

  function fakeFetch(answer: Response) {
    const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fetch = (url: URL, init: RequestInit) => {
      calls.push({ url: url.toString(), method: init.method!, headers: init.headers as Record<string, string> });
      return Promise.resolve(answer);
    };
    return { fetch, calls };
  }

  test('puts a signed object at the bucket path', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 200 }));
    await s3Store(settings, fetch).put('2026-11-09T15-00-00Z/library.sqlite.gz.enc', new Uint8Array([1, 2]));

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(
      'https://account.r2.cloudflarestorage.com/atomes-backups/2026-11-09T15-00-00Z/library.sqlite.gz.enc',
    );
    expect(calls[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=id\/\d{8}\/auto\/s3\/aws4_request, /);
  });

  test('a missing object is null; any other failure throws with the status', async () => {
    expect(await s3Store(settings, fakeFetch(new Response('', { status: 404 })).fetch).get('x')).toBeNull();
    await expect(
      s3Store(settings, fakeFetch(new Response('AccessDenied', { status: 403 })).fetch).put('x', new Uint8Array()),
    ).rejects.toThrow(/403.*AccessDenied/);
  });
});
