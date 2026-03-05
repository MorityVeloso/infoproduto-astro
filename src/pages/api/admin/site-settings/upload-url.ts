// src/pages/api/admin/site-settings/upload-url.ts
// Admin-only: gera URL assinada para upload direto ao Supabase Storage.
// O browser faz o PUT direto ao Supabase (bypassa Cloudflare WAF).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

const VALID_KEYS = new Set(['hero_image', 'architect_image', 'kit_image']);
const VALID_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  let body: { key?: unknown; ext?: unknown };
  try { body = await request.json() as { key?: unknown; ext?: unknown }; }
  catch { return jsonError({ error: 'Corpo da requisição inválido' }, 400); }

  const key = typeof body.key === 'string' ? body.key.trim() : null;
  const ext = typeof body.ext === 'string' ? body.ext.toLowerCase().trim() : null;

  if (!key || !VALID_KEYS.has(key)) return jsonError({ error: 'key inválida' }, 400);
  if (!ext || !VALID_EXTS.has(ext))  return jsonError({ error: 'ext inválida. Use jpg, png ou webp.' }, 400);

  const path = `${key}.${ext === 'jpeg' ? 'jpg' : ext}`;

  const { data, error } = await admin.storage
    .from('site-images')
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) return jsonError({ error: error?.message ?? 'Falha ao gerar URL de upload' }, 500);

  return jsonOk({ ok: true, signedUrl: data.signedUrl, path });
};
