/**
 * mercadopago.ts — Recebe notificações de pagamento do Mercado Pago.
 *
 * POST /api/webhooks/mercadopago
 * Sem autenticação (chamada externa do MP).
 *
 * Segurança: X-Signature HMAC não validado no MVP.
 * Configurar MERCADOPAGO_WEBHOOK_SECRET e validar quando disponível.
 *
 * Fluxo:
 *   1. Extrair paymentId do payload
 *   2. Consultar GET /v1/payments/{id} na API do MP
 *   3. Validar: status=approved, amount=147.00, external_reference=UUID válido
 *   4. Idempotência: se order.status=paid → retornar 200 imediatamente
 *   5. Atualizar order: status, provider_payment_id, paid_at
 *   6. Criar/buscar usuário no Supabase Auth (admin)
 *   7. Upsert profile
 *   8. Vincular order.customer_id
 *   9. Upsert entitlement ativo
 *  10. Gerar magic link e enviar email
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { sendAccessEmail } from '../../../lib/email';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

const AMOUNT_EXPECTED = 147.00;
const PRODUCT_CODE    = 'MAIN_PRODUCT';

// Extrai paymentId da notificação do MP (suporta formatos antigo e novo)
function extractPaymentId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  // Formato "type=payment" → data.id
  if (b.type === 'payment' && b.data && typeof (b.data as Record<string, unknown>).id !== 'undefined') {
    return String((b.data as Record<string, unknown>).id);
  }
  // Formato antigo → id direto (topic=payment)
  if (b.topic === 'payment' && b.id) {
    return String(b.id);
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const rl = checkRateLimit(`webhook:${getClientIp(request)}`, { maxTokens: 50, refillRate: 50 / 60 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  // ── 1. Parse body ──────────────────────────────────────────────
  const body = await request.json().catch(() => null);
  const paymentId = extractPaymentId(body);

  if (!paymentId) {
    // Notificações que não são de pagamento (ex: merchant_order) → 200 para o MP não retentar
    return jsonOk({ ok: true, skipped: true });
  }

  // ── 2. Consultar API do MP ────────────────────────────────────
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN as string | undefined;
  if (!accessToken) {
    console.error('[webhook/mp] MERCADOPAGO_ACCESS_TOKEN não configurada.');
    return jsonError({ error: 'config' }, 500, requestId);
  }

  let payment: Record<string, unknown>;
  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mpRes.ok) {
      console.error('[webhook/mp] MP retornou', mpRes.status, 'para payment', paymentId);
      return jsonError({ error: 'mp_fetch_failed' }, 502, requestId);
    }
    payment = await mpRes.json() as Record<string, unknown>;
  } catch (err) {
    console.error('[webhook/mp] Erro ao consultar MP:', err);
    return jsonError({ error: 'mp_fetch_error' }, 502, requestId);
  }

  // ── 3. Validar pagamento ──────────────────────────────────────
  if (payment.status !== 'approved') {
    // Não aprovado — 200 para o MP não retentar (pode ser pendente, cancelado, etc.)
    return jsonOk({ ok: true, status: payment.status });
  }

  const transactionAmount = Number(payment.transaction_amount ?? 0);
  if (Math.abs(transactionAmount - AMOUNT_EXPECTED) > 0.01) {
    console.error('[webhook/mp] Valor inesperado:', transactionAmount, 'esperado:', AMOUNT_EXPECTED);
    return jsonError({ error: 'amount_mismatch' }, 422, requestId);
  }

  const orderId = payment.external_reference as string | undefined;
  if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orderId)) {
    console.error('[webhook/mp] external_reference inválido:', orderId);
    return jsonError({ error: 'invalid_order_ref' }, 422, requestId);
  }

  // ── 4. Buscar order + idempotência ───────────────────────────
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, status, customer_email, customer_id, customer_name')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[webhook/mp] Order não encontrada:', orderId, orderErr);
    return jsonError({ error: 'order_not_found' }, 404, requestId);
  }

  if (order.status === 'paid') {
    // Já processado — idempotente
    return jsonOk({ ok: true, idempotent: true });
  }

  // Check email before updating order
  const email = order.customer_email;
  if (!email) {
    console.error('[webhook/mp] Order sem customer_email:', orderId);
    return jsonError({ error: 'missing_email' }, 422, requestId);
  }

  // ── 5. Atualizar order ────────────────────────────────────────
  const { error: updateErr } = await admin
    .from('orders')
    .update({
      status:              'paid',
      provider_payment_id: String(paymentId),
      paid_at:             new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateErr) {
    console.error('[webhook/mp] Erro ao atualizar order:', updateErr);
    return jsonError({ error: 'update_failed' }, 500, requestId);
  }

  // ── 6. Criar/buscar usuário no Supabase Auth ──────────────────

  let userId: string;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
  } else if (createErr?.message?.includes('already been registered') || createErr?.status === 422) {
    // Usuário já existe — buscar pelo email diretamente no schema auth
    const { data: found } = await admin
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!found) {
      console.error('[webhook/mp] Usuário não encontrado após conflito de criação:', email);
      return jsonError({ error: 'user_lookup_failed' }, 500, requestId);
    }
    userId = found.id as string;
  } else {
    console.error('[webhook/mp] Erro ao criar usuário:', createErr);
    return jsonError({ error: 'user_create_failed' }, 500, requestId);
  }

  // ── 7. Upsert profile ─────────────────────────────────────────
  const { error: profileErr } = await admin.from('profiles').upsert(
    { id: userId, email },
    { onConflict: 'id' }
  );
  if (profileErr) console.error('[webhook/mp] profile upsert:', profileErr);

  // ── 8. Vincular order.customer_id ────────────────────────────
  const { error: linkErr } = await admin.from('orders')
    .update({ customer_id: userId })
    .eq('id', orderId);
  if (linkErr) console.error('[webhook/mp] order customer_id link:', linkErr);

  // ── 9. Upsert entitlement ─────────────────────────────────────
  const { error: entitlementErr } = await admin.from('entitlements').upsert(
    { customer_id: userId, product_code: PRODUCT_CODE, active: true, granted_at: new Date().toISOString() },
    { onConflict: 'customer_id, product_code' }
  );
  if (entitlementErr) console.error('[webhook/mp] entitlement upsert:', entitlementErr);

  // ── 10. Gerar magic link + enviar email ───────────────────────
  try {
    const baseUrl = (import.meta.env.APP_BASE_URL as string | undefined)?.replace(/\/$/, '')
      ?? new URL(request.url).origin;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:    'magiclink',
      email,
      options: {
        redirectTo: `${baseUrl}/app/kit`,
      },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[webhook/mp] Erro ao gerar magic link:', linkErr);
    } else {
      await sendAccessEmail(email, linkData.properties.action_link, order.customer_name ?? 'Cliente');
    }
  } catch (err) {
    console.error('[webhook/mp] Erro no envio de email:', err);
  }

  return jsonOk({ ok: true });
};
