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
  const { id } = body;

  if (!id || typeof id !== 'string') {
    return jsonError({ error: 'id é obrigatório' }, 400);
  }

  const { error } = await admin
    .from('products')
    .delete()
    .eq('id', (id as string).trim());

  if (error) return jsonError({ error: error.message }, 500);

  return jsonOk({ ok: true });
};
