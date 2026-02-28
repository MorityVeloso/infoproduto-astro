const CT = { 'Content-Type': 'application/json' };

export function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: CT });
}

export function jsonError(body: unknown, status: number, requestId?: string): Response {
  const payload = requestId ? { ...(body as object), requestId } : body;
  const headers: Record<string, string> = { ...CT };
  if (requestId) headers['X-Request-Id'] = requestId;
  return new Response(JSON.stringify(payload), { status, headers });
}
