import { describe, expect, test } from 'vitest';
import { clientIp } from './client-ip';

const request = (headers: Record<string, string> = {}) => new Request('http://catalog.test/api/catalog/editions/9782723478991', { headers });

describe('the client IP behind the proxy (one hop trusted)', () => {
  test('is the address the proxy adds last to X-Forwarded-For', () => {
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7' }), '10.0.1.5')).toBe('203.0.113.7');
  });

  test('a forged extra hop sent by the client is ignored', () => {
    expect(clientIp(request({ 'x-forwarded-for': '198.51.100.1, 203.0.113.7' }), '10.0.1.5')).toBe('203.0.113.7');
  });

  test('with no proxy (local development) it is the address of the connection', () => {
    expect(clientIp(request(), '127.0.0.1')).toBe('127.0.0.1');
  });
});
