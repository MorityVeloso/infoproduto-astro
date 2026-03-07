/**
 * generate.ts — Gera PDF personalizado com marca d'água e salva no Storage.
 *
 * POST /api/watermark/generate
 * Body: { asset_key: string }
 * Autenticado via cookie de sessão.
 *
 * Fluxo:
 *   1. Autenticar usuário
 *   2. Buscar order pago + entitlement
 *   3. Validar asset_key contra produtos ativos
 *   4. Verificar se já existe watermarked/{userId}/{safe_name} → retorna watermark_key
 *   5. Baixar PDF base de protected-assets
 *   6. Gerar PDF com marca d'água
 *   7. Upload para watermarked/{userId}/{safe_name}
 *   8. Retornar { watermark_key }
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { generateWatermarkedPdf } from '../../../lib/pdf/watermark';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';
import { getProductAssets, isAllowedAsset } from '../../../lib/assets';

const BUCKET_BASE         = 'protected-assets';
const BUCKET_PERSONALIZED = 'watermarked';

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401, requestId);
  }

  const rl = checkRateLimit(`watermark-gen:${user.id}`, { maxTokens: 10, refillRate: 10 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  const body     = await request.json().catch(() => null) as { asset_key?: string } | null;
  const assetKey = body?.asset_key?.trim();

  if (!assetKey) {
    return jsonError({ error: 'asset_key obrigatório.' }, 400, requestId);
  }

  const admin = createAdminClient();

  // Buscar order pago mais recente
  const { data: order } = await admin
    .from('orders')
    .select('id, customer_email')
    .eq('customer_id', user.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
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

  // Validar asset_key contra produtos ativos
  const productAssets = await getProductAssets(admin);
  if (!isAllowedAsset(assetKey, productAssets)) {
    return jsonError({ error: 'Asset não autorizado.' }, 403, requestId);
  }

  // Nome seguro para o arquivo watermarked: userId/safe_filename.pdf
  const safeName = assetKey.replace(/\//g, '_');
  const watermarkKey = `${user.id}/${safeName}`;

  // Verificar se já existe
  const { data: existingFiles } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .list(user.id, { limit: 100 });

  const alreadyExists = existingFiles?.some(f => f.name === safeName) ?? false;
  if (alreadyExists) {
    return jsonOk({ watermark_key: watermarkKey });
  }

  // Baixar PDF base
  const { data: baseBlob, error: downloadErr } = await admin.storage
    .from(BUCKET_BASE)
    .download(assetKey);

  if (downloadErr || !baseBlob) {
    console.error('[watermark/generate] Erro ao baixar base PDF:', downloadErr);
    return jsonError({ error: 'PDF base não encontrado.' }, 404, requestId);
  }

  // Gerar PDF com marca d'água
  const basePdfBytes  = new Uint8Array(await baseBlob.arrayBuffer());
  const email         = order.customer_email ?? user.email ?? '';
  const watermarkText = `Exclusivo para: ${email}`;

  let watermarkedBytes: Uint8Array;
  try {
    watermarkedBytes = await generateWatermarkedPdf(basePdfBytes, watermarkText);
  } catch (err) {
    console.error('[watermark/generate] Erro ao gerar PDF:', err);
    return jsonError({ error: 'Falha ao gerar PDF personalizado.' }, 500, requestId);
  }

  // Upload
  const { error: uploadErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .upload(watermarkKey, watermarkedBytes, {
      contentType: 'application/pdf',
      upsert:      false,
    });

  if (uploadErr) {
    const isDuplicate =
      uploadErr.message?.includes('already exists') ||
      (uploadErr as unknown as { statusCode?: string }).statusCode === '23505';

    if (isDuplicate) {
      return jsonOk({ watermark_key: watermarkKey });
    }

    console.error('[watermark/generate] Erro ao fazer upload:', uploadErr);
    return jsonError({ error: 'Falha ao salvar PDF.' }, 500, requestId);
  }

  return jsonOk({ watermark_key: watermarkKey });
};
