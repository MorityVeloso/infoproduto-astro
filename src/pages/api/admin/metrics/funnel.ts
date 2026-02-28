// src/pages/api/admin/metrics/funnel.ts
import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { computeFunnel } from '../../../../lib/metrics';

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
  const since   = new Date(Date.now() - days * 86_400_000).toISOString();

  const admin = createAdminClient();

  // Events (table may not exist)
  const { data: evData, error: evError } = await admin
    .from('events')
    .select('event, session_id')
    .gte('created_at', since);

  const tableExists = !evError || !evError.message.includes('does not exist');
  if (evError && tableExists) return json({ error: evError.message }, 500);

  const events = (tableExists ? evData ?? [] : []) as { event: string; session_id: string | null }[];

  // Paid orders count
  const { data: paidData, error: paidError } = await admin
    .from('orders')
    .select('id')
    .eq('status', 'paid')
    .gte('paid_at', since);

  if (paidError) return json({ error: paidError.message }, 500);

  return json(computeFunnel(events, paidData?.length ?? 0), 200);
};
