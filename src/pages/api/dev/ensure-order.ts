/**
 * ensure-order.ts — Cria ordem de teste com status='paid' para o MVP.
 * ⚠️  APENAS em NODE_ENV=development. Retorna 404 em produção.
 *
 * POST /api/dev/ensure-order
 * Idempotente: retorna a ordem existente se já houver uma paga.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PRODUCT_CODE = 'MAIN_PRODUCT';

export const POST: APIRoute = async ({ request }) => {
  // Guard: apenas em desenvolvimento
  if (import.meta.env.MODE !== 'development') {
    return new Response(
      JSON.stringify({ error: 'Not found.' }),
      { status: 404, headers: JSON_HEADERS }
    );
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado.' }),
      { status: 401, headers: JSON_HEADERS }
    );
  }

  const admin = createAdminClient();

  // Retorna a ordem existente se já houver (idempotente)
  const { data: existing } = await admin
    .from('orders')
    .select('*')
    .eq('customer_id', user.id)
    .eq('status', 'paid')
    .eq('provider', 'dev')
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ order: existing }), { status: 200, headers: JSON_HEADERS });
  }

  // Cria ordem de teste (MVP sem pagamento real)
  const { data: newOrder, error } = await admin
    .from('orders')
    .insert({
      customer_id:    user.id,
      customer_email: user.email ?? '',
      status:         'paid',
      amount_total:   147.00,
      installments:   12,
      provider:       'dev',
      paid_at:        new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !newOrder) {
    console.error('[ensure-order] erro ao criar:', error);
    return new Response(
      JSON.stringify({ error: 'Falha ao criar ordem de teste.' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  // Criar entitlement para o usuário de dev
  const { error: entitlementErr } = await admin.from('entitlements').upsert(
    { customer_id: user.id, product_code: PRODUCT_CODE, active: true, granted_at: new Date().toISOString() },
    { onConflict: 'customer_id, product_code' }
  );
  if (entitlementErr) console.error('[ensure-order] entitlement upsert:', entitlementErr);

  return new Response(JSON.stringify({ order: newOrder }), { status: 201, headers: JSON_HEADERS });
};
