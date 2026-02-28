// src/pages/api/admin/models/update.ts
import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { id, name, subtitle, description, sort_order, is_active,
          colors, tag, tag_color, cover_path } = body;

  if (!id || typeof id !== 'string' || !(id as string).trim()) {
    return jsonError({ error: 'id é obrigatório' }, 400);
  }
  if (!name || typeof name !== 'string' || (name as string).trim().length < 2) {
    return jsonError({ error: 'name deve ter pelo menos 2 caracteres' }, 400);
  }
  if (!subtitle || typeof subtitle !== 'string' || (subtitle as string).trim().length < 2) {
    return jsonError({ error: 'subtitle deve ter pelo menos 2 caracteres' }, 400);
  }
  if (!description || typeof description !== 'string' || (description as string).trim().length < 10) {
    return jsonError({ error: 'description deve ter pelo menos 10 caracteres' }, 400);
  }

  const payload: Record<string, unknown> = {
    name:        (name as string).trim(),
    subtitle:    (subtitle as string).trim(),
    description: (description as string).trim(),
  };

  if (typeof sort_order === 'number')     payload.sort_order = sort_order;
  if (typeof is_active  === 'boolean')    payload.is_active  = is_active;
  if (Array.isArray(colors))              payload.colors     = colors;
  if (typeof tag === 'string')            payload.tag        = (tag as string).trim() || null;
  if (typeof tag_color === 'string')      payload.tag_color  = (tag_color as string).trim() || null;
  if (typeof cover_path === 'string')     payload.cover_path = (cover_path as string).trim() || null;

  const { data, error } = await admin
    .from('models')
    .update(payload)
    .eq('id', (id as string).trim())
    .select()
    .single();

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true, model: data });
};
