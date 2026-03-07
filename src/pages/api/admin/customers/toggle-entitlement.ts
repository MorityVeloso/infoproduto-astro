import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({}));
  const { customerId, active } = body;

  if (!customerId || !UUID_RE.test(customerId) || typeof active !== 'boolean') {
    return json({ error: 'customerId (uuid) e active (boolean) são obrigatórios' }, 400);
  }

  const admin = createAdminClient();

  if (active) {
    const { error } = await admin.from('entitlements').upsert(
      {
        customer_id:  customerId,
        product_code: 'MAIN_PRODUCT',
        active:       true,
        granted_at:   new Date().toISOString(),
        revoked_at:   null,
      },
      { onConflict: 'customer_id, product_code' },
    );
    if (error) return json({ error: error.message }, 500);
  } else {
    const { error } = await admin
      .from('entitlements')
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('product_code', 'MAIN_PRODUCT');
    if (error) return json({ error: error.message }, 500);
  }

  return json({ success: true }, 200);
};
