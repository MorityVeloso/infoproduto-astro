/**
 * status.ts — Consulta status de um pedido (para polling PIX).
 *
 * GET /api/checkout/status?order_id=UUID
 * Retorna: { status: string, order_id: string }
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  // 20 consultas/min por IP — suporta polling a cada 3s
  const rl = checkRateLimit(`status:${getClientIp(request)}`, { maxTokens: 20, refillRate: 20 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.', retryAfter: rl.retryAfter }, 429, requestId);

  const orderId = new URL(request.url).searchParams.get('order_id') ?? '';
  if (!UUID_RE.test(orderId)) {
    return jsonError({ error: 'order_id inválido.' }, 400, requestId);
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('orders')
    .select('status')   // apenas status — sem PII
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) {
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
  }

  return jsonOk({ status: data.status, order_id: orderId });
};
