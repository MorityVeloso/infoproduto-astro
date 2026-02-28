// src/pages/api/admin/models/index.ts
import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('models')
    .select('id, name, subtitle, description, sort_order, is_active, cover_path, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);

  return json({ models: data ?? [] }, 200);
};
