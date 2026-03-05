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
  const { name, description, price, type, is_active, sort_order } = body;

  if (!name || typeof name !== 'string' || (name as string).trim().length < 2) {
    return jsonError({ error: 'name deve ter pelo menos 2 caracteres' }, 400);
  }
  if (typeof price !== 'number' || price < 0 || price > 99999.99) {
    return jsonError({ error: 'price deve ser um número entre 0 e 99999.99' }, 400);
  }
  if (!type || typeof type !== 'string' || !VALID_TYPES.has(type as string)) {
    return jsonError({ error: 'type deve ser main, order_bump ou brinde' }, 400);
  }

  const payload: Record<string, unknown> = {
    name:        (name as string).trim(),
    price,
    type,
  };

  if (typeof description === 'string')  payload.description = (description as string).trim() || null;
  if (typeof sort_order === 'number')   payload.sort_order  = sort_order;
  if (typeof is_active === 'boolean')   payload.is_active   = is_active;

  const { data, error } = await admin
    .from('products')
    .insert(payload)
    .select()
    .single();

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true, product: data });
};
