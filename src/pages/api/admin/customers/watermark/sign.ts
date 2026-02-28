/**
 * sign.ts — Admin: Gera signed URL para o PDF personalizado de qualquer pedido.
 *
 * GET /api/admin/customers/watermark/sign?orderId=...
 * Autenticado via cookie de sessão — requer role='admin'.
 *
 * Diferenças em relação ao endpoint do cliente:
 *   - Sem verificação de ownership (qualquer pedido pode ser acessado)
 *   - Sem verificação de entitlement
 *   - Registra download com o customer_id do pedido (não do admin)
 *   - Só registra download se order.customer_id for não-nulo
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../../lib/auth';
import { createAdminClient } from '../../../../../lib/supabase/admin';

const H                    = { 'Content-Type': 'application/json' };
const BUCKET_PERSONALIZED  = 'kit-personalizado';
const SIGNED_URL_EXPIRES_S = 120;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: H });

export const GET: APIRoute = async ({ request }) => {
  // 1. Admin auth
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  // 2. Query param
  const orderId = new URL(request.url).searchParams.get('orderId')?.trim();
  if (!orderId) return json({ error: 'orderId obrigatório.' }, 400);

  const admin = createAdminClient();

  // 3. Validate order is paid (no ownership check)
  const { data: order } = await admin
    .from('orders')
    .select('id, customer_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.status !== 'paid') {
    return json({ error: 'Pedido não encontrado.' }, 404);
  }

  // 4. Generate signed URL
  const personalizedPath = `${orderId}/projeto.pdf`;
  const { data: signed, error: storageErr } = await admin.storage
    .from(BUCKET_PERSONALIZED)
    .createSignedUrl(personalizedPath, SIGNED_URL_EXPIRES_S);

  if (storageErr || !signed?.signedUrl) {
    if (storageErr) console.error('[admin/watermark/sign] createSignedUrl error:', storageErr.message ?? storageErr);
    return json(
      { error: 'PDF personalizado não encontrado. Gere-o primeiro.', notFound: true },
      404,
    );
  }

  // 5. Record download (use order's customer_id, not admin's id)
  if (order.customer_id) {
    const assetKey = `${BUCKET_PERSONALIZED}/${personalizedPath}`;
    const { error: dlErr } = await admin.from('downloads').insert({
      customer_id: order.customer_id,
      order_id:    orderId,
      asset_key:   assetKey,
    });
    if (dlErr) console.error('[admin/watermark/sign] downloads insert:', dlErr.message ?? dlErr);
  }

  return json({ url: signed.signedUrl }, 200);
};
