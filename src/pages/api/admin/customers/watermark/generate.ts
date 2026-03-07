/**
 * generate.ts — Admin: Gera PDF personalizado com marca d'água para qualquer pedido.
 *
 * POST /api/admin/customers/watermark/generate
 * Body: { orderId: string, asset_key?: string }
 * Autenticado via cookie de sessão — requer role='admin'.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../../lib/auth';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { generateWatermarkedPdf } from '../../../../../lib/pdf/watermark';

const H                   = { 'Content-Type': 'application/json' };
const BUCKET_BASE         = 'protected-assets';
const BUCKET_PERSONALIZED = 'watermarked';
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: H });

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const body     = await request.json().catch(() => null) as { orderId?: string; asset_key?: string } | null;
  const orderId  = body?.orderId?.trim();
  if (!orderId) return json({ error: 'orderId obrigatório.' }, 400);

  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, customer_email, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.status !== 'paid') {
    return json({ error: 'Pedido não encontrado.' }, 404);
  }

  // Resolve asset_key: use provided or find main product's asset_path
  let assetKey = body?.asset_key?.trim();
  if (!assetKey) {
    const { data: mainProduct } = await admin
      .from('products')
      .select('asset_path')
      .eq('type', 'main')
      .eq('is_active', true)
      .not('asset_path', 'is', null)
      .limit(1)
      .maybeSingle();
    assetKey = (mainProduct?.asset_path as string) ?? null;
    if (!assetKey) return json({ error: 'Nenhum produto principal com arquivo encontrado.' }, 404);
  }

  const safeName = assetKey.replace(/\//g, '_');
  const customerId = order.customer_id as string;
  const personalizedPath = `${customerId}/${safeName}`;

  // Check if already exists
  const { data: existingFiles } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .list(customerId, { limit: 100 });

  if (existingFiles?.some(f => f.name === safeName)) {
    return json({ alreadyExists: true }, 200);
  }

  // Download base PDF
  const { data: baseBlob, error: downloadErr } = await admin.storage
    .from(BUCKET_BASE)
    .download(assetKey);

  if (downloadErr || !baseBlob) {
    console.error('[admin/watermark/generate] base PDF download error:', downloadErr?.message ?? downloadErr);
    return json({ error: 'PDF base não encontrado.' }, 404);
  }

  // Generate watermarked PDF
  const basePdfBytes  = new Uint8Array(await baseBlob.arrayBuffer());
  const watermarkText = `Exclusivo para: ${order.customer_email} • Pedido: ${orderId}`;

  let watermarkedBytes: Uint8Array;
  try {
    watermarkedBytes = await generateWatermarkedPdf(basePdfBytes, watermarkText);
  } catch (err) {
    console.error('[admin/watermark/generate] PDF generation error:', err);
    return json({ error: 'Falha ao gerar PDF personalizado.' }, 500);
  }

  // Upload
  const { error: uploadErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .upload(personalizedPath, watermarkedBytes, { contentType: 'application/pdf', upsert: false });

  if (uploadErr) {
    const isDuplicate =
      uploadErr.message?.includes('already exists') ||
      (uploadErr as unknown as { statusCode?: string }).statusCode === '23505';
    if (isDuplicate) return json({ alreadyExists: true }, 200);
    console.error('[admin/watermark/generate] upload error:', uploadErr.message ?? uploadErr);
    return json({ error: 'Falha ao salvar PDF.' }, 500);
  }

  return json({ ok: true }, 200);
};
