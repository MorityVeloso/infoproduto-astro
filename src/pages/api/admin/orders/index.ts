import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Proibido' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const url      = new URL(request.url);
  const status   = url.searchParams.get('status') ?? '';
  const q        = url.searchParams.get('q') ?? '';
  const days     = Number(url.searchParams.get('days') ?? '0');
  const page     = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '25')));

  const VALID_STATUSES = new Set(['pending', 'paid', 'cancelled', 'refunded']);
  if (status && !VALID_STATUSES.has(status)) {
    return new Response(JSON.stringify({ error: 'status inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isNaN(page) || isNaN(pageSize)) {
    return new Response(JSON.stringify({ error: 'page e pageSize devem ser números inteiros' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createAdminClient();
  let query = admin
    .from('orders')
    .select(
      'id, customer_id, customer_email, status, amount_total, created_at, paid_at, email_sent_at',
      { count: 'exact' },
    );

  if (status) query = query.eq('status', status);
  if (q)      query = query.ilike('customer_email', `%${q}%`);
  if (days > 0) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    query = query.gte('created_at', since);
  }

  const from = (page - 1) * pageSize;
  const { data: orders, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const customerIds = (orders ?? [])
    .map(o => o.customer_id)
    .filter(Boolean) as string[];

  let entitlementMap: Record<string, boolean> = {};
  if (customerIds.length > 0) {
    const entAdmin = createAdminClient();
    const { data: ents, error: entError } = await entAdmin
      .from('entitlements')
      .select('customer_id, active')
      .in('customer_id', customerIds);
    if (entError) return new Response(JSON.stringify({ error: entError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    for (const e of ents ?? []) {
      entitlementMap[e.customer_id] = e.active;
    }
  }

  const result = (orders ?? []).map(o => ({
    ...o,
    entitlement_active: o.customer_id ? (entitlementMap[o.customer_id] ?? null) : null,
  }));

  return new Response(
    JSON.stringify({ orders: result, total: count ?? 0, page, pageSize }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
