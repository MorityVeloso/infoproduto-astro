/**
 * asaas.ts — Recebe notificações de pagamento do Asaas.
 *
 * POST /api/webhooks/asaas
 * Sem autenticação (chamada externa do Asaas).
 * Configurar a URL no painel Asaas: Configurações → Integrações → Webhooks.
 *
 * Eventos de pagamento:
 *   - PAYMENT_CONFIRMED  (cartão de crédito confirmado)
 *   - PAYMENT_RECEIVED   (Pix / boleto recebido)
 *   - CHECKOUT_PAID      (pagamento via link de pagamento/checkout)
 *
 * Eventos de lifecycle (abandoned cart tracking):
 *   - CHECKOUT_CREATED   → order.status = 'checkout_started'
 *   - CHECKOUT_EXPIRED   → order.status = 'expired'
 *   - CHECKOUT_CANCELED  → order.status = 'canceled'
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { provisionAccess } from '../../../lib/provision-access';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED']);
const PAID_EVENTS   = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'CHECKOUT_PAID']);

const LIFECYCLE_EVENTS = new Set(['CHECKOUT_CREATED', 'CHECKOUT_EXPIRED', 'CHECKOUT_CANCELED']);
const LIFECYCLE_STATUS: Record<string, string> = {
  CHECKOUT_CREATED:  'checkout_started',
  CHECKOUT_EXPIRED:  'expired',
  CHECKOUT_CANCELED: 'canceled',
};

interface AsaasPayment {
  id:                string;
  status:            string;
  value:             number;
  externalReference: string | null;
  paymentLink?:      string | null;
}

interface AsaasCheckout {
  id:                string;
  externalReference?: string | null;
  payment?:          AsaasPayment;
}

interface AsaasWebhook {
  event:     string;
  payment?:  AsaasPayment;
  checkout?: AsaasCheckout;
}

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const rl = checkRateLimit(`webhook:${getClientIp(request)}`, { maxTokens: 50, refillRate: 50 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  const body = await request.json().catch(() => null) as AsaasWebhook | null;

  if (!body?.event) {
    return jsonOk({ ok: true, skipped: true });
  }

  // Validar authToken via header (Asaas envia no header asaas-access-token)
  // process.env para runtime — import.meta.env é inlinado em build time pelo Vite
  const expectedToken = (process.env.ASAAS_WEBHOOK_TOKEN ?? import.meta.env.ASAAS_WEBHOOK_TOKEN) as string | undefined;
  if (expectedToken) {
    const receivedToken = request.headers.get('asaas-access-token');
    if (receivedToken !== expectedToken) {
      console.error('[webhook/asaas] authToken inválido — header:', receivedToken?.slice(0, 8) ?? '(ausente)');
      return jsonError({ error: 'unauthorized' }, 401, requestId);
    }
  }

  if (LIFECYCLE_EVENTS.has(body.event)) {
    return handleLifecycleEvent(body, requestId);
  }

  if (!PAID_EVENTS.has(body.event)) {
    return jsonOk({ ok: true, skipped: true, event: body.event });
  }

  const payment = body.payment ?? body.checkout?.payment;

  if (!payment) {
    return jsonOk({ ok: true, skipped: true, reason: 'no_payment_object' });
  }

  if (!PAID_STATUSES.has(payment.status)) {
    return jsonOk({ ok: true, status: payment.status });
  }

  const orderId = payment.externalReference;
  if (!orderId || !UUID_RE.test(orderId)) {
    console.error('[webhook/asaas] externalReference inválido:', orderId);
    return jsonError({ error: 'invalid_order_ref' }, 422, requestId);
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, customer_email, customer_id, customer_name, amount_total')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[webhook/asaas] Order não encontrada:', orderId, orderErr);
    return jsonError({ error: 'order_not_found' }, 404, requestId);
  }

  if (order.status === 'paid') {
    return jsonOk({ ok: true, idempotent: true });
  }

  // Validar valor contra amount_total do pedido (tolerância R$0,01 para arredondamentos)
  if (payment.value < Number(order.amount_total) - 0.01) {
    console.error('[webhook/asaas] Valor inesperado:', payment.value, 'esperado:', order.amount_total);
    return jsonError({ error: 'amount_mismatch' }, 422, requestId);
  }

  const email = order.customer_email;
  if (!email) {
    console.error('[webhook/asaas] Order sem customer_email:', orderId);
    return jsonError({ error: 'missing_email' }, 422, requestId);
  }

  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status:              'paid',
      provider_payment_id: payment.id,
      paid_at:             new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateErr) {
    console.error('[webhook/asaas] Erro ao atualizar order:', updateErr);
    return jsonError({ error: 'update_failed' }, 500, requestId);
  }

  try {
    const baseUrl = (import.meta.env.APP_BASE_URL as string | undefined)?.replace(/\/$/, '')
      ?? new URL(request.url).origin;

    await provisionAccess(email, orderId, admin, baseUrl, order.customer_name ?? 'Cliente');
  } catch (err) {
    console.error('[webhook/asaas] provisionAccess falhou:', err);
    return jsonError({ error: 'provision_failed' }, 500, requestId);
  }

  return jsonOk({ ok: true });
};

async function handleLifecycleEvent(body: AsaasWebhook, requestId: string) {
  const newStatus = LIFECYCLE_STATUS[body.event];
  if (!newStatus) return jsonOk({ ok: true, skipped: true });

  const orderId =
    body.checkout?.externalReference ??
    body.checkout?.payment?.externalReference ??
    null;

  if (!orderId || !UUID_RE.test(orderId)) {
    console.warn('[webhook/asaas] lifecycle sem orderId válido:', body.event, orderId);
    return jsonOk({ ok: true, skipped: true, reason: 'no_order_ref' });
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .maybeSingle();

  const protectedStatuses = new Set(['paid', 'failed']);
  if (!order || protectedStatuses.has(order.status)) {
    return jsonOk({ ok: true, skipped: true, reason: 'status_protected' });
  }

  const { error } = await admin
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) {
    console.error('[webhook/asaas] lifecycle update falhou:', body.event, orderId, error);
    return jsonError({ error: 'update_failed' }, 500, requestId);
  }

  console.info('[webhook/asaas] lifecycle:', body.event, '→', newStatus, orderId);
  return jsonOk({ ok: true, lifecycle: newStatus });
}
