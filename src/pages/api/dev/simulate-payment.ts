/**
 * simulate-payment.ts — Simula confirmação de pagamento para testes locais.
 * ⚠️  APENAS em NODE_ENV=development. Retorna 404 em produção.
 *
 * POST /api/dev/simulate-payment
 * Body: { order_id: string }
 *
 * Fluxo idêntico ao webhook Asaas:
 *   1. Busca order pelo ID
 *   2. Marca como paid
 *   3. Chama provisionAccess (cria usuário, entitlement, envia email)
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { provisionAccess } from '../../../lib/provision-access';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  if (import.meta.env.MODE !== 'development') {
    return json({ error: 'Not found.' }, 404);
  }

  const body = await request.json().catch(() => ({})) as { order_id?: unknown };
  const orderId = body.order_id;

  if (!orderId || typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
    return json({ error: 'order_id inválido.' }, 400);
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, customer_email, customer_name')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) return json({ error: 'Pedido não encontrado.' }, 404);
  if (order.status === 'paid') return json({ ok: true, skipped: 'already_paid' }, 200);
  if (!order.customer_email) return json({ error: 'Order sem customer_email.' }, 422);

  // Marcar como pago
  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status:              'paid',
      provider_payment_id: `dev_sim_${Date.now()}`,
      paid_at:             new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateErr) {
    console.error('[dev/simulate-payment] update failed:', updateErr);
    return json({ error: 'Falha ao atualizar order.' }, 500);
  }

  // Provisionar acesso (mesmo fluxo do webhook real)
  const baseUrl = new URL(request.url).origin;
  try {
    await provisionAccess(
      order.customer_email,
      orderId,
      admin,
      baseUrl,
      order.customer_name ?? 'Cliente',
    );
  } catch (err) {
    console.error('[dev/simulate-payment] provisionAccess failed:', err);
    return json({ error: 'provisionAccess falhou.', detail: String(err) }, 500);
  }

  return json({ ok: true, order_id: orderId }, 200);
};
