/**
 * list.ts — Retorna os asset keys disponíveis para o usuário + flags de existência.
 *
 * GET /api/assets/list
 * Autenticado. Valida: user → order pago → entitlement.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { buildAssetList, checkAssetExistence } from '../../../lib/assets';
import { jsonOk, jsonError } from '../../../lib/http';

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401);
  }

  const admin = createAdminClient();

  // Busca order pago mais recente
  const { data: order } = await admin
    .from('orders')
    .select('id')
    .eq('customer_id', user.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return jsonError({ error: 'Pedido não encontrado.' }, 404);
  }

  // Verificar entitlement ativo
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id')
    .eq('customer_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!entitlement) {
    return jsonError({ error: 'Acesso não autorizado.' }, 403);
  }

  const [assets, existence] = await Promise.all([
    Promise.resolve(buildAssetList()),
    checkAssetExistence(admin),
  ]);

  return jsonOk({ orderId: order.id, assets, existence });
};
