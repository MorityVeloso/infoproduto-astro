/**
 * pay.ts — Cria cobrança real no Asaas (PIX ou cartão).
 *
 * POST /api/checkout/pay
 * Body:
 *   { order_id, customer_name, customer_email, payment_method: 'pix' }
 *   { order_id, customer_name, customer_email, payment_method: 'credit_card',
 *     card: { holderName, number, expiryMonth, expiryYear, ccv, cpfCnpj, installments } }
 *
 * PIX retorna: { payment_method:'pix', qr_image, qr_text, expires_at, order_id }
 * Cartão retorna: { payment_method:'credit_card', status:'success'|'pending', order_id }
 *
 * Dados brutos do cartão são enviados S2S para o Asaas — nunca armazenados ou logados.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { provisionAccess } from '../../../lib/provision-access';
import { sendOrderCreatedEmail } from '../../../lib/email';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';
import { PRODUCT } from '../../../config/product';

// ── Constantes ──────────────────────────────────────────────────────────────

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CPF_RE   = /^\d{11}$/;

// ── Helpers ─────────────────────────────────────────────────────────────────

function asaasBaseUrl(): string {
  return (import.meta.env.ASAAS_SANDBOX === 'true')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Asaas API ───────────────────────────────────────────────────────────────

async function createCustomer(apiKey: string, name: string, email: string, cpfCnpj: string): Promise<string> {
  const res = await fetch(`${asaasBaseUrl()}/customers`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': apiKey },
    body:    JSON.stringify({ name, email, cpfCnpj, notificationDisabled: true }),
  });
  if (!res.ok) throw new Error(`Asaas /customers ${res.status}: ${await res.text()}`);
  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error('Asaas customer: id ausente na resposta');
  return data.id;
}

async function createPixCharge(
  apiKey: string, customerId: string, orderId: string, amount: number,
): Promise<string> {
  const res = await fetch(`${asaasBaseUrl()}/payments`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': apiKey },
    body:    JSON.stringify({
      customer:          customerId,
      billingType:       'PIX',
      value:             amount,
      dueDate:           tomorrowDate(),
      description:       PRODUCT.description,
      externalReference: orderId,
    }),
  });
  if (!res.ok) throw new Error(`Asaas /payments PIX ${res.status}: ${await res.text()}`);
  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error('Asaas PIX payment: id ausente na resposta');
  return data.id;
}

async function fetchPixQrCode(
  apiKey: string, paymentId: string,
): Promise<{ qr_image: string; qr_text: string; expires_at: string }> {
  const res = await fetch(`${asaasBaseUrl()}/payments/${paymentId}/pixQrCode`, {
    headers: { 'access_token': apiKey },
  });
  if (!res.ok) throw new Error(`Asaas pixQrCode ${res.status}: ${await res.text()}`);
  const data = await res.json() as { encodedImage?: string; payload?: string; expirationDate?: string };
  if (!data.encodedImage || !data.payload) throw new Error('Asaas pixQrCode: resposta incompleta');
  return {
    qr_image:   data.encodedImage,
    qr_text:    data.payload,
    expires_at: data.expirationDate ?? tomorrowDate() + 'T23:59:59Z',
  };
}

async function createCardCharge(
  apiKey: string, customerId: string, orderId: string, amount: number,
  card: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string; cpfCnpj: string; email: string; installments: number },
): Promise<{ status: string; paymentId: string }> {
  const res = await fetch(`${asaasBaseUrl()}/payments`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': apiKey },
    body:    JSON.stringify({
      customer:          customerId,
      billingType:       'CREDIT_CARD',
      value:             amount,
      dueDate:           tomorrowDate(),
      description:       PRODUCT.description,
      externalReference: orderId,
      installmentCount:  card.installments,
      creditCard: {
        holderName:  card.holderName,
        number:      card.number.replace(/\D/g, ''),
        expiryMonth: card.expiryMonth,
        expiryYear:  card.expiryYear,
        ccv:         card.ccv,
      },
      creditCardHolderInfo: {
        name:    card.holderName,
        email:   card.email,
        cpfCnpj: card.cpfCnpj,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ errors: [] })) as { errors?: Array<{ description?: string }> };
    const msg = errBody.errors?.[0]?.description ?? `Erro ${res.status} no processamento do cartão.`;
    throw new CardDeclineError(msg);
  }

  const data = await res.json() as { id?: string; status?: string };
  if (!data.id) throw new Error('Asaas card payment: id ausente na resposta');
  return { status: data.status ?? 'PENDING', paymentId: data.id };
}

class CardDeclineError extends Error {
  constructor(msg: string) { super(msg); this.name = 'CardDeclineError'; }
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface CardInput {
  holderName:   string;
  number:       string;
  expiryMonth:  string;
  expiryYear:   string;
  ccv:          string;
  installments: number;
}

interface PayBody {
  order_id:       string;
  customer_name:  string;
  customer_email: string;
  customer_cpf:   string;
  payment_method: 'pix' | 'credit_card';
  card?:          CardInput;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();

  const rl = checkRateLimit(`pay:${getClientIp(request)}`, { maxTokens: 5, refillRate: 5 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.', retryAfter: rl.retryAfter }, 429, requestId);

  const body = await request.json().catch(() => null) as PayBody | null;

  if (!body?.order_id || !UUID_RE.test(body.order_id))
    return jsonError({ error: 'order_id inválido.' }, 400, requestId);
  if (!body.customer_name?.trim() || body.customer_name.trim().length < 2)
    return jsonError({ error: 'Nome inválido.' }, 400, requestId);
  if (!body.customer_email?.trim() || !EMAIL_RE.test(body.customer_email))
    return jsonError({ error: 'E-mail inválido.' }, 400, requestId);
  if (body.payment_method !== 'pix' && body.payment_method !== 'credit_card')
    return jsonError({ error: 'payment_method deve ser pix ou credit_card.' }, 400, requestId);
  if (!CPF_RE.test(body.customer_cpf ?? ''))
    return jsonError({ error: 'CPF inválido — informe 11 dígitos sem pontuação.' }, 400, requestId);

  if (body.payment_method === 'credit_card') {
    const c = body.card;
    if (!c)                    return jsonError({ error: 'Dados do cartão obrigatórios.' }, 400, requestId);
    if (!c.holderName?.trim()) return jsonError({ error: 'Nome no cartão obrigatório.' }, 400, requestId);
    if (!c.number?.trim())     return jsonError({ error: 'Número do cartão obrigatório.' }, 400, requestId);
    if (!c.expiryMonth?.trim()) return jsonError({ error: 'Mês de validade obrigatório.' }, 400, requestId);
    if (!c.expiryYear?.trim()) return jsonError({ error: 'Ano de validade obrigatório.' }, 400, requestId);
    if (!c.ccv?.trim())        return jsonError({ error: 'CVV obrigatório.' }, 400, requestId);
    const inst = Number(c.installments);
    if (!Number.isInteger(inst) || inst < 1 || inst > 12)
      return jsonError({ error: 'Parcelas deve ser entre 1 e 12.' }, 400, requestId);
  }

  const apiKey = import.meta.env.ASAAS_API_KEY as string | undefined;
  if (!apiKey) return jsonError({ error: 'Configuração de pagamento ausente.' }, 500, requestId);

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, amount_total, customer_email')
    .eq('id', body.order_id)
    .maybeSingle();

  if (orderErr || !order)
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
  if (order.customer_email !== body.customer_email)
    return jsonError({ error: 'Dados do pedido inconsistentes.' }, 403, requestId);
  if (order.status === 'paid')
    return jsonOk({ status: 'already_paid', order_id: body.order_id });
  if (order.status !== 'pending' && order.status !== 'checkout_started')
    return jsonError({ error: `Pedido não pode ser pago (status: ${order.status}).` }, 409, requestId);

  const name  = body.customer_name.trim();
  const email = body.customer_email.trim();

  let asaasCustomerId: string;
  try {
    asaasCustomerId = await createCustomer(apiKey, name, email, body.customer_cpf);
  } catch (err) {
    console.error('[checkout/pay] createCustomer failed:', err);
    return jsonError({ error: 'Falha ao registrar cliente. Tente novamente.' }, 502, requestId);
  }

  // ── PIX ───────────────────────────────────────────────────────
  if (body.payment_method === 'pix') {
    let paymentId: string;
    try {
      paymentId = await createPixCharge(apiKey, asaasCustomerId, body.order_id, order.amount_total);
    } catch (err) {
      console.error('[checkout/pay] createPixCharge failed:', err);
      return jsonError({ error: 'Falha ao criar cobrança PIX. Tente novamente.' }, 502, requestId);
    }

    let qr: { qr_image: string; qr_text: string; expires_at: string };
    try {
      qr = await fetchPixQrCode(apiKey, paymentId);
    } catch (err) {
      console.error('[checkout/pay] fetchPixQrCode failed:', err);
      qr = { qr_image: '', qr_text: '', expires_at: '' };
    }

    await admin.from('orders')
      .update({ provider_payment_id: paymentId, status: 'checkout_started', customer_name: name })
      .eq('id', body.order_id);

    void sendOrderCreatedEmail(name, email, {
      orderId:       body.order_id,
      amount:        order.amount_total,
      paymentMethod: 'pix',
      pixCode:       qr.qr_text || undefined,
    }).catch(err => console.error('[checkout/pay] Email 1 PIX:', err));

    return jsonOk({ payment_method: 'pix', qr_image: qr.qr_image, qr_text: qr.qr_text, expires_at: qr.expires_at, order_id: body.order_id });
  }

  // ── Cartão ────────────────────────────────────────────────────
  const card = body.card!;
  let result: { status: string; paymentId: string };

  try {
    result = await createCardCharge(apiKey, asaasCustomerId, body.order_id, order.amount_total, {
      ...card, cpfCnpj: body.customer_cpf, email,
    });
  } catch (err) {
    if (err instanceof CardDeclineError)
      return jsonError({ error: err.message }, 402, requestId);
    console.error('[checkout/pay] createCardCharge failed:', err);
    return jsonError({ error: 'Falha ao processar cartão. Tente novamente.' }, 502, requestId);
  }

  const isPaid    = new Set(['CONFIRMED', 'RECEIVED']).has(result.status);
  const newStatus = isPaid ? 'paid' : 'checkout_started';

  await admin.from('orders')
    .update({
      provider_payment_id: result.paymentId,
      status:              newStatus,
      customer_name:       name,
      installments:        Number(card.installments),
      ...(isPaid ? { paid_at: new Date().toISOString() } : {}),
    })
    .eq('id', body.order_id);

  const baseUrl = (import.meta.env.APP_BASE_URL as string | undefined)?.replace(/\/$/, '')
    ?? new URL(request.url).origin;

  if (isPaid) {
    void provisionAccess(email, body.order_id, admin, baseUrl, name)
      .catch(err => console.error('[checkout/pay] provisionAccess failed:', err));
  } else {
    void sendOrderCreatedEmail(name, email, {
      orderId: body.order_id, amount: order.amount_total, paymentMethod: 'credit_card',
    }).catch(err => console.error('[checkout/pay] Email 1 card:', err));
  }

  return jsonOk({ payment_method: 'credit_card', status: isPaid ? 'success' : 'pending', order_id: body.order_id });
};
