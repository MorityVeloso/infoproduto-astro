/**
 * generate.ts — Admin: Gera PDF personalizado com marca d'água para qualquer pedido.
 *
 * POST /api/admin/customers/watermark/generate
 * Body: { orderId: string }
 * Autenticado via cookie de sessão — requer role='admin'.
 *
 * Fluxo (admin):
 *   1. Autenticar usuário e verificar role='admin'
 *   2. Validar orderId
 *   3. Validar order (status=paid) — sem verificação de ownership ou entitlement
 *   4. Verificar se já existe kit-personalizado/{orderId}/projeto.pdf → {alreadyExists:true}
 *   5. Baixar PDF base de protected-assets
 *   6. Gerar PDF com marca d'água
 *   7. Upload para kit-personalizado/{orderId}/projeto.pdf
 *   8. Retornar {ok:true}
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../../lib/auth';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { generateWatermarkedPdf } from '../../../../../lib/pdf/watermark';

const H                   = { 'Content-Type': 'application/json' };
const BUCKET_BASE         = 'protected-assets';
const BUCKET_PERSONALIZED = 'kit-personalizado';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: H });

export const POST: APIRoute = async ({ request }) => {
  // 1. Admin auth
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  // 2. Parse body
  const body    = await request.json().catch(() => null) as { orderId?: string } | null;
  const orderId = body?.orderId?.trim();
  if (!orderId) return json({ error: 'orderId obrigatório.' }, 400);

  const admin = createAdminClient();

  // 3. Validate order exists and is paid (no ownership check, no entitlement check)
  const { data: order } = await admin
    .from('orders')
    .select('id, customer_email, selected_model, selected_size, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.status !== 'paid') {
    return json({ error: 'Pedido não encontrado.' }, 404);
  }
  if (!order.selected_model || !order.selected_size) {
    return json({ error: 'Seleção incompleta.' }, 422);
  }

  const personalizedPath = `${orderId}/projeto.pdf`;

  // 4. Check if already exists
  const { data: existingFiles } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .list(orderId);

  if (existingFiles?.some(f => f.name === 'projeto.pdf')) {
    return json({ alreadyExists: true }, 200);
  }

  // 5. Download base PDF
  const baseKey = `kit/${order.selected_model}/${order.selected_size}/projeto_base.pdf`;
  const { data: baseBlob, error: downloadErr } = await admin.storage
    .from(BUCKET_BASE)
    .download(baseKey);

  if (downloadErr || !baseBlob) {
    console.error('[admin/watermark/generate] base PDF download error:', downloadErr?.message ?? downloadErr);
    return json({ error: 'PDF base não encontrado.' }, 404);
  }

  // 6. Generate watermarked PDF
  const basePdfBytes  = new Uint8Array(await baseBlob.arrayBuffer());
  const watermarkText = `Exclusivo para: ${order.customer_email} • Pedido: ${orderId}`;

  let watermarkedBytes: Uint8Array;
  try {
    watermarkedBytes = await generateWatermarkedPdf(basePdfBytes, watermarkText);
  } catch (err) {
    console.error('[admin/watermark/generate] PDF generation error:', err);
    return json({ error: 'Falha ao gerar PDF personalizado.' }, 500);
  }

  // 7. Upload
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
