import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({}));
  const { id, is_active } = body;

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return json({ error: 'id é obrigatório' }, 400);
  }
  if (typeof is_active !== 'boolean') {
    return json({ error: 'is_active deve ser boolean' }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('models')
    .update({ is_active })
    .eq('id', id.trim());

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true }, 200);
};
