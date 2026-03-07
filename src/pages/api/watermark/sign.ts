/**
 * sign.ts — Gera signed URL para o PDF personalizado (watermarked).
 *
 * GET /api/watermark/sign?key=userId/safe_filename.pdf
 * Autenticado via cookie de sessão.
 *
 * Valida que o key pertence ao usuário logado, gera signed URL de 120s
 * e registra download.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';

const BUCKET_PERSONALIZED  = 'watermarked';
const SIGNED_URL_EXPIRES_S = 120;

export const GET: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401, requestId);
  }

  const rl = checkRateLimit(`watermark-sign:${user.id}`, { maxTokens: 10, refillRate: 10 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  const url = new URL(request.url);
  const watermarkKey = url.searchParams.get('key')?.trim();

  if (!watermarkKey) {
    return jsonError({ error: 'key obrigatório.' }, 400, requestId);
  }

  // Validar que o key pertence ao usuário logado (formato: userId/filename)
  if (!watermarkKey.startsWith(`${user.id}/`)) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403, requestId);
  }

  const admin = createAdminClient();

  // Verificar entitlement ativo
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id')
    .eq('customer_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!entitlement) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403, requestId);
  }

  // Gerar signed URL
  const { data: signed, error: storageErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .createSignedUrl(watermarkKey, SIGNED_URL_EXPIRES_S);

  if (storageErr || !signed?.signedUrl) {
    if (storageErr) console.error('[watermark/sign] createSignedUrl error:', storageErr);
    return jsonError(
      { error: 'PDF personalizado não encontrado. Gere-o primeiro.', notFound: true },
      404,
      requestId,
    );
  }

  // Registrar download
  const { data: order } = await admin
    .from('orders')
    .select('id')
    .eq('customer_id', user.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (order) {
    const { error: dlErr } = await admin.from('downloads').insert({
      customer_id: user.id,
      order_id:    order.id,
      asset_key:   `${BUCKET_PERSONALIZED}/${watermarkKey}`,
    });
    if (dlErr) console.error('[watermark/sign] downloads insert:', dlErr);
  }

  return jsonOk({ url: signed.signedUrl });
};
