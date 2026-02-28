/**
 * list.ts — Retorna os asset keys disponíveis para o usuário + flags de existência.
 *
 * GET /api/assets/list
 * Autenticado. Valida: user → order pago + seleção completa → entitlement.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildAssetList, checkAssetExistence } from '../../../lib/assets';

const H = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401, headers: H });
  }

  const admin = createAdminClient();

  // Busca order pago com seleção completa
  const { data: order } = await admin
    .from('orders')
    .select('id, selected_model, selected_size, size_changes_used, selection_completed_at')
    .eq('customer_id', user.id)
    .eq('status', 'paid')
    .not('selected_model', 'is', null)
    .not('selection_completed_at', 'is', null)
    .maybeSingle();

  if (!order) {
    return new Response(
      JSON.stringify({ error: 'Pedido não encontrado ou seleção incompleta.' }),
      { status: 404, headers: H }
    );
  }

  // Verificar entitlement ativo
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id')
    .eq('customer_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!entitlement) {
    return new Response(
      JSON.stringify({ error: 'Acesso não autorizado.' }),
      { status: 403, headers: H }
    );
  }

  // Checar existência dos arquivos no Storage (4 chamadas paralelas)
  const [assets, existence] = await Promise.all([
    Promise.resolve(buildAssetList(order.selected_model, order.selected_size)),
    checkAssetExistence(admin, order.selected_model, order.selected_size),
  ]);

  return new Response(
    JSON.stringify({
      orderId:         order.id,
      model:           order.selected_model,
      size:            order.selected_size,
      sizeChangesUsed: order.size_changes_used,
      assets,
      existence,
    }),
    { status: 200, headers: H }
  );
};
