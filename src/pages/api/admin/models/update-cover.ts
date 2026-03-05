// src/pages/api/admin/models/update-cover.ts
// Admin-only: atualiza cover_path após upload direto ao Supabase Storage.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { id, cover_path } = body;

  if (!id || typeof id !== 'string') return jsonError({ error: 'id obrigatório' }, 400);
  if (!cover_path || typeof cover_path !== 'string') return jsonError({ error: 'cover_path obrigatório' }, 400);

  const { error } = await admin
    .from('models')
    .update({ cover_path: (cover_path as string).trim() })
    .eq('id', (id as string).trim());

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true });
};
