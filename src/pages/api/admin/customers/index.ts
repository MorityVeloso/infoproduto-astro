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

  const url        = new URL(request.url);
  const q          = url.searchParams.get('q') ?? '';
  const rawPage    = url.searchParams.get('page') ?? '1';
  const rawSize    = url.searchParams.get('pageSize') ?? '25';

  if (isNaN(Number(rawPage)) || isNaN(Number(rawSize))) {
    return json({ error: 'page e pageSize devem ser números inteiros' }, 400);
  }

  const page     = Math.max(1, Number(rawPage));
  const pageSize = Math.min(100, Math.max(1, Number(rawSize)));

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_list_customers', {
    p_q:      q.trim() || null,
    p_limit:  pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) return json({ error: error.message }, 500);

  const { customers, total } = data as { customers: unknown[]; total: number };

  return json({ customers: customers ?? [], total: total ?? 0, page, pageSize }, 200);
};
