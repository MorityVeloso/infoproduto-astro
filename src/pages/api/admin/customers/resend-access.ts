export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { sendAccessEmail } from '../../../../lib/email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  const body = await request.json().catch(() => ({}));
  const { customerId } = body as { customerId?: unknown };
  if (!customerId || typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
    return json({ error: 'customerId inválido' }, 400);
  }

  const admin = createAdminClient();

  // Find customer email from profiles
  const { data: customerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('id, email')
    .eq('id', customerId)
    .maybeSingle();

  if (profileErr) {
    console.error('[customers/resend-access] profile lookup error:', profileErr.message);
    return json({ error: 'Erro ao buscar cliente' }, 500);
  }
  if (!customerProfile) return json({ error: 'Cliente não encontrado' }, 404);

  // Generate magic link
  const baseUrl = (import.meta.env.APP_BASE_URL as string | undefined)?.replace(/\/$/, '')
    ?? new URL(request.url).origin;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type:    'magiclink',
    email:   customerProfile.email,
    options: { redirectTo: `${baseUrl}/app/kit` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[customers/resend-access] generateLink error:', linkErr?.message ?? linkErr);
    return json({ error: 'Erro ao gerar link de acesso' }, 500);
  }

  await sendAccessEmail(customerProfile.email, linkData.properties.action_link, 'Cliente');

  return json({ success: true }, 200);
};
