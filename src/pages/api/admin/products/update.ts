import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

export const prerender = false;

const VALID_TYPES = new Set(['main', 'order_bump', 'brinde']);

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { id, name, description, price, type, is_active, sort_order, cover_path, asset_path } = body;

  if (!id || typeof id !== 'string') {
    return jsonError({ error: 'id é obrigatório' }, 400);
  }
  if (!name || typeof name !== 'string' || (name as string).trim().length < 2) {
    return jsonError({ error: 'name deve ter pelo menos 2 caracteres' }, 400);
  }

  const payload: Record<string, unknown> = {
    name:       (name as string).trim(),
    updated_at: new Date().toISOString(),
  };

  if (typeof description === 'string')  payload.description = (description as string).trim() || null;
  if (typeof price === 'number' && price >= 0 && price <= 99999.99) payload.price = price;
  if (typeof type === 'string' && VALID_TYPES.has(type)) payload.type = type;
  if (typeof sort_order === 'number')   payload.sort_order  = sort_order;
  if (typeof is_active === 'boolean')   payload.is_active   = is_active;
  if (typeof cover_path === 'string')   payload.cover_path  = (cover_path as string).trim() || null;
  if (typeof asset_path === 'string')   payload.asset_path  = (asset_path as string).trim() || null;

  const { data, error } = await admin
    .from('products')
    .update(payload)
    .eq('id', (id as string).trim())
    .select()
    .single();

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true, product: data });
};
