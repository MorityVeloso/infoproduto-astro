import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const customerId = new URL(request.url).searchParams.get('customerId') ?? '';
  if (!customerId || !UUID_RE.test(customerId)) {
    return json({ error: 'customerId (uuid) é obrigatório' }, 400);
  }

  const admin = createAdminClient();

  // Profile
  const { data: customerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('id, email, role, created_at')
    .eq('id', customerId)
    .maybeSingle();

  if (profileErr) return json({ error: profileErr.message }, 500);
  if (!customerProfile) return json({ error: 'Cliente não encontrado' }, 404);

  // Orders (all, newest first)
  const { data: orders, error: ordersErr } = await admin
    .from('orders')
    .select('id, status, amount_total, created_at, paid_at, customer_email')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (ordersErr) return json({ error: ordersErr.message }, 500);

  // Entitlement
  const { data: entitlement, error: entErr } = await admin
    .from('entitlements')
    .select('customer_id, product_code, active, granted_at, revoked_at')
    .eq('customer_id', customerId)
    .eq('product_code', 'MAIN_PRODUCT')
    .maybeSingle();

  if (entErr) return json({ error: entErr.message }, 500);

  // Downloads (last 100)
  const { data: downloads, error: dlErr } = await admin
    .from('downloads')
    .select('id, order_id, asset_key, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (dlErr) return json({ error: dlErr.message }, 500);

  return json({
    profile:     customerProfile,
    orders:      orders ?? [],
    entitlement: entitlement ?? null,
    downloads:   downloads ?? [],
  }, 200);
};
