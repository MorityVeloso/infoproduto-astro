import { describe, it, expect } from 'vitest';
import { jsonOk, jsonError } from '../../src/lib/http';

describe('jsonOk', () => {
  it('returns 200 with JSON body', async () => {
    const res = jsonOk({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ hello: 'world' });
  });
});

describe('jsonError', () => {
  it('returns given status with JSON body', async () => {
    const res = jsonError({ error: 'not found' }, 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('includes requestId in body and header when provided', async () => {
    const res = jsonError({ error: 'bad' }, 400, 'req-123');
    expect(res.headers.get('X-Request-Id')).toBe('req-123');
    const body = await res.json();
    expect(body.requestId).toBe('req-123');
    expect(body.error).toBe('bad');
  });
});
