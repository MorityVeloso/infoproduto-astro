/**
 * generate.ts — Gera PDF personalizado com marca d'água e salva no Storage.
 *
 * POST /api/watermark/generate
 * Body: { orderId: string }
 * Autenticado via cookie de sessão.
 *
 * Fluxo:
 *   1. Autenticar usuário
 *   2. Validar order (status=paid, customer_id=user.id, seleção completa)
 *   3. Verificar se já existe kit-personalizado/{orderId}/projeto.pdf → {alreadyExists:true}
 *   4. Baixar PDF base de protected-assets
 *   5. Gerar PDF com marca d'água
 *   6. Upload para kit-personalizado/{orderId}/projeto.pdf
 *   7. Retornar {ok:true}
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { generateWatermarkedPdf } from '../../../lib/pdf/watermark';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';

const BUCKET_BASE         = 'protected-assets';
const BUCKET_PERSONALIZED = 'kit-personalizado';

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  // ── 1. Auth ───────────────────────────────────────────────────
  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401, requestId);
  }

  // ── Rate limit ────────────────────────────────────────────────
  const rl = checkRateLimit(`watermark-gen:${user.id}`, { maxTokens: 10, refillRate: 10 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  // ── 2. Parse body ─────────────────────────────────────────────
  const body    = await request.json().catch(() => null) as { orderId?: string } | null;
  const orderId = body?.orderId?.trim();

  if (!orderId) {
    return jsonError({ error: 'orderId obrigatório.' }, 400, requestId);
  }

  const admin = createAdminClient();

  // ── 3. Validar order ──────────────────────────────────────────
  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, customer_email, selected_model, selected_size, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.status !== 'paid') {
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
  }
  if (order.customer_id !== user.id) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403, requestId);
  }
  if (!order.selected_model || !order.selected_size) {
    return jsonError({ error: 'Seleção incompleta.' }, 422, requestId);
  }

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

  const personalizedPath = `${orderId}/projeto.pdf`;

  // ── 4. Verificar se já existe ─────────────────────────────────
  const { data: existingFiles } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .list(orderId);

  const alreadyExists = existingFiles?.some(f => f.name === 'projeto.pdf') ?? false;
  if (alreadyExists) {
    return jsonOk({ alreadyExists: true });
  }

  // ── 5. Baixar PDF base ────────────────────────────────────────
  const baseKey = `kit/${order.selected_model}/${order.selected_size}/projeto_base.pdf`;
  const { data: baseBlob, error: downloadErr } = await admin.storage
    .from(BUCKET_BASE)
    .download(baseKey);

  if (downloadErr || !baseBlob) {
    console.error('[watermark/generate] Erro ao baixar base PDF:', downloadErr);
    return jsonError({ error: 'PDF base não encontrado.' }, 404, requestId);
  }

  // ── 6. Gerar PDF com marca d'água ─────────────────────────────
  const basePdfBytes  = new Uint8Array(await baseBlob.arrayBuffer());
  const email         = order.customer_email ?? user.email ?? '';
  const watermarkText = `Exclusivo para: ${email} • Pedido: ${orderId}`;

  let watermarkedBytes: Uint8Array;
  try {
    watermarkedBytes = await generateWatermarkedPdf(basePdfBytes, watermarkText);
  } catch (err) {
    console.error('[watermark/generate] Erro ao gerar PDF:', err);
    return jsonError({ error: 'Falha ao gerar PDF personalizado.' }, 500, requestId);
  }

  // ── 7. Upload para kit-personalizado ──────────────────────────
  const { error: uploadErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .upload(personalizedPath, watermarkedBytes, {
      contentType: 'application/pdf',
      upsert:      false,
    });

  if (uploadErr) {
    // Race condition: two concurrent requests passed the existence check simultaneously.
    // The second upload fails with a duplicate error — treat it as alreadyExists, not a failure.
    const isDuplicate =
      uploadErr.message?.includes('already exists') ||
      (uploadErr as unknown as { statusCode?: string }).statusCode === '23505';

    if (isDuplicate) {
      return jsonOk({ alreadyExists: true });
    }

    console.error('[watermark/generate] Erro ao fazer upload:', uploadErr);
    return jsonError({ error: 'Falha ao salvar PDF.' }, 500, requestId);
  }

  return jsonOk({ ok: true });
};
