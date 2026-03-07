/**
 * list.ts — Retorna os assets disponíveis para o usuário.
 *
 * GET /api/assets/list
 * Autenticado. Valida: user -> order pago -> entitlement.
 * Retorna lista dinâmica de produtos ativos com asset_path.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { getProductAssets, checkAssetExistence } from '../../../lib/assets';
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

  const assets = await getProductAssets(admin);
  const existence = await checkAssetExistence(admin, assets);

  return jsonOk({ orderId: order.id, assets, existence });
};
