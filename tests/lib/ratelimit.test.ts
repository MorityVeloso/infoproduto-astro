import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from '../../src/lib/ratelimit';

describe('checkRateLimit', () => {
  it('allows requests within limit', () => {
    const key = `test-${Date.now()}`;
    const r = checkRateLimit(key, { maxTokens: 5, refillRate: 1 });
    expect(r.allowed).toBe(true);
    expect(r.retryAfter).toBeUndefined();
  });

  it('rejects when tokens are exhausted', () => {
    const key = `exhaust-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      checkRateLimit(key, { maxTokens: 3, refillRate: 0.001 });
    }
    const r = checkRateLimit(key, { maxTokens: 3, refillRate: 0.001 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '9.8.7.6' },
    });
    expect(getClientIp(req)).toBe('9.8.7.6');
  });

  it('returns unknown when no IP headers', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('unknown');
  });
});
