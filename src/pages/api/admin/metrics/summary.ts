import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { computeSummary } from '../../../../lib/metrics';

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);
  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from('orders')
    .select('status, paid_at, amount_total, created_at')
    .in('status', ['paid', 'refunded']);

  if (error) return json({ error: error.message }, 500);

  return json(computeSummary(orders ?? [], new Date()), 200);
};
