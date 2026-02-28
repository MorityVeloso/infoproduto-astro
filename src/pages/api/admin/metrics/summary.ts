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
    .select('status, paid_at, amount_total, selected_model, selected_size, created_at')
    .in('status', ['paid', 'refunded']);

  if (error) return json({ error: error.message }, 500);

  const { data: modelsData, error: modelsError } = await admin.from('models').select('id, name');
  if (modelsError) return json({ error: modelsError.message }, 500);
  const modelNames = Object.fromEntries(
    (modelsData ?? []).map((m: { id: string; name: string }) => [m.id, m.name]),
  );

  return json(computeSummary(orders ?? [], modelNames, new Date()), 200);
};
