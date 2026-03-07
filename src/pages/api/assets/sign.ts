/**
 * sign.ts — Gera signed URL para um asset de produto.
 *
 * POST /api/assets/sign
 * Body: { assetKey: string, action?: 'view' | 'download', session_id?: string }
 *
 * Valida: user -> rate limit -> order -> entitlement -> asset na lista de produtos ativos.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import { getProductAssets, isAllowedAsset } from '../../../lib/assets';
import { jsonOk, jsonError } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';

const SIGNED_URL_EXPIRES_SECONDS = 120;

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError({ error: 'Não autenticado.' }, 401);
  }

  const requestId = crypto.randomUUID();

  const rl = checkRateLimit(`assets-sign:${user.id}`, { maxTokens: 30, refillRate: 0.5 });
  if (!rl.allowed) return jsonError({ error: 'Rate limit excedido.' }, 429, requestId);

  const body = await request.json().catch(() => null) as { assetKey?: string; action?: string; session_id?: string } | null;
  const assetKey  = body?.assetKey?.trim();
  const action    = (body?.action === 'view') ? 'view' : 'download';
  const sessionId = body?.session_id as string | undefined;

  if (!assetKey) {
    return jsonError({ error: 'assetKey obrigatório.' }, 400, requestId);
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
    return jsonError({ error: 'Pedido não encontrado.' }, 404, requestId);
  }

  // Busca assets dinâmicos da tabela products
  const productAssets = await getProductAssets(admin);

  // Nunca assinar asset fora da lista permitida
  if (!isAllowedAsset(assetKey, productAssets)) {
    return jsonError({ error: 'Asset não autorizado.' }, 403, requestId);
  }

  // Verificar entitlement ativo
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id')
    .eq('customer_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!entitlement) {
    return jsonError(
      { error: 'Acesso não autorizado. Entre em contato com o suporte.' },
      403,
      requestId
    );
  }

  // Gerar signed URL via admin client (service role — necessário para bucket privado)
  const { data: signed, error: storageError } = await admin.storage
    .from('protected-assets')
    .createSignedUrl(assetKey, SIGNED_URL_EXPIRES_SECONDS);

  // Arquivo não encontrado no Storage — não é erro fatal
  if (storageError || !signed?.signedUrl) {
    return jsonOk({ url: null, notFound: true });
  }

  // Registrar ação (fire-and-forget — não bloqueia a resposta)
  if (action === 'download') {
    void admin.from('downloads').insert({
      customer_id: user.id,
      order_id:    order.id,
      asset_key:   assetKey,
    });
  } else {
    void admin.from('events').insert({
      event_name: 'asset_view',
      session_id: sessionId ?? null,
      order_id:   order.id,
    });
  }

  return jsonOk({ url: signed.signedUrl });
};
