// src/pages/api/admin/metrics/timeseries.ts
import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { computeTimeseries } from '../../../../lib/metrics';

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);
  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const url     = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') || '30');
  const days    = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('orders')
    .select('paid_at, amount_total')
    .eq('status', 'paid')
    .gte('paid_at', since);

  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []).filter((r: { paid_at: string | null }) => r.paid_at) as { paid_at: string; amount_total: number }[];
  return json({ timeseries: computeTimeseries(rows, days, new Date()) }, 200);
};
