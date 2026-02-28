/**
 * provision-access.ts — Provisiona acesso após pagamento confirmado.
 *
 * 1. Criar/buscar usuário no Supabase Auth
 * 2. Upsert profile
 * 3. Vincular order.customer_id
 * 4. Upsert entitlement ativo
 * 5. Gerar magic link + enviar email
 *
 * Idempotente: seguro chamar múltiplas vezes para o mesmo order.
 * Usado por: webhooks/asaas.ts + api/checkout/pay.ts (confirmação síncrona).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAccessEmail } from './email';
import { PRODUCT } from '../config/product';

export async function provisionAccess(
  email:   string,
  orderId: string,
  admin:   SupabaseClient,
  baseUrl: string,
  name:    string = 'Cliente',
): Promise<void> {
  // ── 1. Criar/buscar usuário ──────────────────────────────────────
  let userId: string;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
  } else if (createErr?.message?.includes('already been registered') || createErr?.status === 422) {
    const { data: found } = await admin
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!found) throw new Error(`User lookup failed after conflict for: ${email}`);
    userId = found.id as string;
  } else {
    throw new Error(`User creation failed: ${createErr?.message}`);
  }

  // ── 2. Upsert profile ────────────────────────────────────────────
  const { error: profileErr } = await admin.from('profiles').upsert(
    { id: userId, email },
    { onConflict: 'id' },
  );
  if (profileErr) console.error('[provision] profile upsert:', profileErr);

  // ── 3. Vincular order.customer_id ────────────────────────────────
  const { error: linkErr } = await admin.from('orders')
    .update({ customer_id: userId })
    .eq('id', orderId);
  if (linkErr) console.error('[provision] order customer_id link:', linkErr);

  // ── 4. Upsert entitlement ────────────────────────────────────────
  const { error: entitlementErr } = await admin.from('entitlements').upsert(
    {
      customer_id:  userId,
      product_code: PRODUCT.code,
      active:       true,
      granted_at:   new Date().toISOString(),
    },
    { onConflict: 'customer_id, product_code' },
  );
  if (entitlementErr) console.error('[provision] entitlement upsert:', entitlementErr);

  // ── 5. Magic link + email ────────────────────────────────────────
  const { data: linkData, error: magicLinkErr } = await admin.auth.admin.generateLink({
    type:    'magiclink',
    email,
    options: { redirectTo: `${baseUrl}${PRODUCT.routes.afterLogin}` },
  });

  if (magicLinkErr || !linkData?.properties?.action_link) {
    console.error('[provision] magic link generation failed:', magicLinkErr);
    return; // email é melhor-esforço; acesso já provisionado acima
  }

  const sent = await sendAccessEmail(email, linkData.properties.action_link, name);

  if (sent) {
    const { error: emailAtErr } = await admin
      .from('orders')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', orderId);
    if (emailAtErr) console.error('[provision] email_sent_at update:', emailAtErr);
  } else {
    console.warn('[provision] email não enviado para:', email, 'order:', orderId);
  }
}
