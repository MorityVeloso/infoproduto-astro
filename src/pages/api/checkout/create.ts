/**
 * create.ts — Cria order no Supabase e retorna order_id.
 *
 * POST /api/checkout/create
 * Body: { name: string, email: string, order_bump?: boolean }
 * Retorna: { order_id: string }
 *
 * O pagamento real (PIX ou cartão) é feito em /api/checkout/pay.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';
import { PRODUCT } from '../../../config/product';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const rl = checkRateLimit(`checkout:${getClientIp(request)}`, { maxTokens: 10, refillRate: 10 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.', retryAfter: rl.retryAfter }, 429, requestId);

  // ── 1. Parse + validação ──────────────────────────────────────
  const body = await request.json().catch(() => null) as { name?: string; email?: string; order_bump?: boolean } | null;

  const name      = body?.name?.trim()  ?? '';
  const email     = body?.email?.trim() ?? '';
  const orderBump = body?.order_bump === true;

  if (name.length < 2)       return jsonError({ error: 'Nome deve ter ao menos 2 caracteres.' }, 400, requestId);
  if (!EMAIL_RE.test(email)) return jsonError({ error: 'E-mail inválido.' }, 400, requestId);

  // ── 2. Calcular total ─────────────────────────────────────────
  const amountTotal = orderBump
    ? PRODUCT.pricing.base + PRODUCT.pricing.bump
    : PRODUCT.pricing.base;

  // ── 3. Criar order no Supabase ────────────────────────────────
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      customer_id:    null,
      customer_email: email,
      status:         'pending',
      amount_total:   amountTotal,
      installments:   1,
      provider:       'asaas',
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[checkout/create] erro ao criar order:', orderError);
    return jsonError({ error: 'Falha ao criar pedido.' }, 500, requestId);
  }

  return jsonOk({ order_id: order.id as string });
};
