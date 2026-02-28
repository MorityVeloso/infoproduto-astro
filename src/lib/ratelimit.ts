interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  maxTokens?: number;
  refillRate?: number; // tokens per second
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = {},
): { allowed: boolean; retryAfter?: number } {
  const { maxTokens = 10, refillRate = 10 / 60 } = opts;
  const now    = Date.now();
  const bucket = buckets.get(key) ?? { tokens: maxTokens, lastRefill: now };

  const elapsed   = (now - bucket.lastRefill) / 1000;
  const newTokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);

  if (newTokens < 1) {
    buckets.set(key, { tokens: newTokens, lastRefill: now });
    const retryAfter = Math.ceil((1 - newTokens) / refillRate);
    return { allowed: false, retryAfter };
  }

  buckets.set(key, { tokens: newTokens - 1, lastRefill: now });
  return { allowed: true };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
