/**
 * sign.ts — Gera signed URL para o PDF personalizado do pedido.
 *
 * GET /api/watermark/sign?orderId=...
 * Autenticado via cookie de sessão.
 *
 * Valida ownership do pedido, gera signed URL de 120s e registra download.
 * Retorna 404 se o PDF ainda não foi gerado (chamar /generate primeiro).
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';

const BUCKET_PERSONALIZED  = 'kit-personalizado';
const SIGNED_URL_EXPIRES_S = 120;

export const GET: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  // ── 1. Auth ───────────────────────────────────────────────────
  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401, requestId);
  }

  // ── Rate limit ────────────────────────────────────────────────
  const rl = checkRateLimit(`watermark-sign:${user.id}`, { maxTokens: 10, refillRate: 10 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  // ── 2. Query param ────────────────────────────────────────────
  const url     = new URL(request.url);
  const orderId = url.searchParams.get('orderId')?.trim();

  if (!orderId) {
    return jsonError({ error: 'orderId obrigatório.' }, 400, requestId);
  }

  const admin = createAdminClient();

  // ── 3. Validar ownership do pedido ────────────────────────────
  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.status !== 'paid') {
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
  }
  if (order.customer_id !== user.id) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403, requestId);
  }

  // ── 4. Verificar entitlement ─────────────────────────────────
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id')
    .eq('customer_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!entitlement) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403, requestId);
  }

  // ── 5. Gerar signed URL ───────────────────────────────────────
  const personalizedPath = `${orderId}/projeto.pdf`;
  const { data: signed, error: storageErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .createSignedUrl(personalizedPath, SIGNED_URL_EXPIRES_S);

  if (storageErr || !signed?.signedUrl) {
    if (storageErr) console.error('[watermark/sign] createSignedUrl error:', storageErr);
    return jsonError(
      { error: 'PDF personalizado não encontrado. Gere-o primeiro.', notFound: true },
      404,
      requestId,
    );
  }

  // ── 6. Registrar download ─────────────────────────────────────
  const assetKey = `${BUCKET_PERSONALIZED}/${personalizedPath}`;
  const { error: dlErr } = await admin.from('downloads').insert({
    customer_id: user.id,
    order_id:    orderId,
    asset_key:   assetKey,
  });
  if (dlErr) console.error('[watermark/sign] downloads insert:', dlErr);

  return jsonOk({ url: signed.signedUrl });
};
