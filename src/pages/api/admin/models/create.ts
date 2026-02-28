// src/pages/api/admin/models/create.ts
import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

export const prerender = false;

const SLUG_RE = /^[a-z0-9-]+$/;

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { id, name, subtitle, description, sort_order = 0, is_active = true,
          colors, tag, tag_color, cover_path } = body;

  if (!id || typeof id !== 'string' || id.length < 2 || id.length > 32 || !SLUG_RE.test(id)) {
    return jsonError({ error: 'id deve ter entre 2 e 32 caracteres e conter apenas letras minúsculas, números e hífens' }, 400);
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
    id:          (id as string).trim(),
    name:        (name as string).trim(),
    subtitle:    (subtitle as string).trim(),
    description: (description as string).trim(),
    sort_order:  typeof sort_order === 'number' ? sort_order : 0,
    is_active:   typeof is_active  === 'boolean' ? is_active : true,
  };

  if (Array.isArray(colors))              payload.colors     = colors;
  if (typeof tag === 'string')            payload.tag        = tag.trim() || null;
  if (typeof tag_color === 'string')      payload.tag_color  = tag_color.trim() || null;
  if (typeof cover_path === 'string')     payload.cover_path = cover_path.trim() || null;

  const { data, error } = await admin
    .from('models')
    .insert(payload)
    .select()
    .single();

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true, model: data });
};
