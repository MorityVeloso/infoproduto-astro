/**
 * POST /api/admin/orders/resend-access
 *
 * Reenvio de acesso para um pedido existente.
 * Requer autenticação de admin.
 *
 * Body: { orderId: string (UUID) }
 *
 * Fluxo:
 *   1. Valida autenticação (401) e role admin (403)
 *   2. Valida orderId (UUID)
 *   3. Busca o pedido
 *   4. Cria ou encontra usuário no Supabase Auth pelo email
 *   5. Upsert profile
 *   6. Vincula customer_id ao pedido se ausente
 *   7. Upsert entitlement ativo
 *   8. Gera magic link
 *   9. Envia email de acesso
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { sendAccessEmail } from '../../../../lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_CODE = 'QUARTO_DE_BEBE';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  // 1. Validar autenticação
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  // 2. Validar body
  const body = await request.json().catch(() => ({}));
  const { orderId } = body as { orderId?: unknown };
  if (!orderId || typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
    return json({ error: 'orderId inválido' }, 400);
  }

  // 3. Buscar pedido
  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, customer_email, customer_id, customer_name')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return json({ error: 'Pedido não encontrado' }, 404);

  // 4. Criar ou encontrar usuário no Supabase Auth
  let authUserId: string | undefined;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: order.customer_email,
    email_confirm: true,
  });

  if (createData?.user) {
    authUserId = createData.user.id;
  } else if (createErr && (createErr.message.includes('already been registered') || createErr.status === 422)) {
    const { data: existing } = await admin
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', order.customer_email)
      .maybeSingle();
    authUserId = existing?.id;
  } else if (createErr) {
    console.error('[resend-access] Erro ao criar usuário:', createErr.message);
    return json({ error: 'Erro ao processar usuário' }, 500);
  }

  if (!authUserId) {
    console.error('[resend-access] authUserId indefinido para email:', order.customer_email);
    return json({ error: 'Usuário não encontrado' }, 500);
  }

  // 5. Upsert profile
  const { error: profileErr } = await admin.from('profiles').upsert(
    { id: authUserId, email: order.customer_email, role: 'customer' },
    { onConflict: 'id' },
  );
  if (profileErr) {
    console.error('[resend-access] profile upsert error:', profileErr.message);
    return json({ error: 'Erro ao criar perfil do usuário' }, 500);
  }

  // 6. Vincular customer_id ao pedido se ausente
  if (!order.customer_id) {
    const { error: linkErr } = await admin
      .from('orders')
      .update({ customer_id: authUserId })
      .eq('id', orderId);
    if (linkErr) {
      console.error('[resend-access] order customer_id link error:', linkErr.message);
      return json({ error: 'Erro ao vincular pedido ao usuário' }, 500);
    }
  }
  const customerId = order.customer_id ?? authUserId;

  // 7. Upsert entitlement ativo
  const { error: entErr } = await admin.from('entitlements').upsert(
    {
      customer_id: customerId,
      product_code: PRODUCT_CODE,
      active: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'customer_id, product_code' },
  );
  if (entErr) {
    console.error('[resend-access] Erro ao ativar entitlement:', entErr.message);
    return json({ error: 'Erro ao ativar acesso' }, 500);
  }

  // 8. Gerar magic link
  const baseUrl = (import.meta.env.APP_BASE_URL as string | undefined)?.replace(/\/$/, '')
    ?? new URL(request.url).origin;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type:    'magiclink',
    email:   order.customer_email,
    options: { redirectTo: `${baseUrl}/app/kit` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[resend-access] Erro ao gerar magic link:', linkErr);
    return json({ error: 'Erro ao gerar link de acesso' }, 500);
  }

  // 9. Enviar email de acesso
  const sent = await sendAccessEmail(order.customer_email, linkData.properties.action_link, order.customer_name ?? 'Cliente');
  if (sent) {
    await admin.from('orders').update({ email_sent_at: new Date().toISOString() }).eq('id', orderId);
  }

  return json({ success: true }, 200);
};
