/**
 * track.ts — Registra eventos do funil de conversão.
 *
 * POST /api/events/track
 * Aceita anon (sem autenticação obrigatória).
 * Body: { event_name, email?, order_id?, session_id?, utm_*? }
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../lib/http';

const ALLOWED_EVENTS = new Set([
  'view_landing',       // usuário abre a landing page
  'click_cta',          // clica em qualquer botão CTA
  'view_checkout',      // abre a página de checkout
  'start_payment',      // envia o formulário (antes do redirect)
  'purchase_confirmed', // retorna na página de sucesso
]);

interface TrackBody {
  event_name:    string;
  email?:        string;
  order_id?:     string;
  session_id?:   string;
  variant?:      string;
  utm_source?:   string;
  utm_medium?:   string;
  utm_campaign?: string;
  utm_content?:  string;
  utm_term?:     string;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as TrackBody | null;

  if (!body?.event_name?.trim()) {
    return jsonError({ error: 'event_name obrigatório.' }, 400);
  }

  const eventName = body.event_name.trim();

  if (!ALLOWED_EVENTS.has(eventName)) {
    return jsonError({ error: `event_name inválido. Permitidos: ${[...ALLOWED_EVENTS].join(', ')}` }, 400);
  }

  const admin = createAdminClient();

  // fire-and-forget — não bloqueia resposta
  admin.from('events').insert({
    event_name:   eventName,
    email:        body.email        ?? null,
    order_id:     body.order_id     ?? null,
    session_id:   body.session_id   ?? null,
    variant:      body.variant      ?? null,
    utm_source:   body.utm_source   ?? null,
    utm_medium:   body.utm_medium   ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content:  body.utm_content  ?? null,
    utm_term:     body.utm_term     ?? null,
  }).then(({ error }) => { if (error) console.error('[events/track] insert falhou:', error); });

  return jsonOk({ ok: true });
};
