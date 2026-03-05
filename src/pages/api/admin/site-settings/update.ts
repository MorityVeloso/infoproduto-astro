// src/pages/api/admin/site-settings/update.ts
// Admin-only: atualiza uma configuração na tabela site_settings.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

const VALID_KEYS = new Set(['hero_image', 'architect_image', 'kit_image']);

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  let body: { key?: unknown; value?: unknown };
  try { body = await request.json() as { key?: unknown; value?: unknown }; }
  catch { return jsonError({ error: 'Corpo da requisição inválido' }, 400); }

  const key   = typeof body.key   === 'string' ? body.key.trim()   : null;
  const value = typeof body.value === 'string' ? body.value.trim() : null;

  if (!key || !VALID_KEYS.has(key))   return jsonError({ error: 'key inválida' }, 400);
  if (value === null)                  return jsonError({ error: 'value obrigatório' }, 400);

  const { error: dbErr } = await admin
    .from('site_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (dbErr) return jsonError({ error: dbErr.message }, 500);

  return jsonOk({ ok: true });
};
