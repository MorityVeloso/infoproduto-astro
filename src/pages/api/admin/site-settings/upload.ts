// src/pages/api/admin/site-settings/upload.ts
// Admin-only: uploads a site image and updates site_settings.value with the storage path.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

const VALID_KEYS = new Set(['hero_image', 'architect_image', 'kit_image']);

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError({ error: 'Não autorizado' }, 401);

  const admin = createAdminClient();
  const { data: profile, error: pErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (pErr || !profile || profile.role !== 'admin') return jsonError({ error: 'Proibido' }, 403);

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return jsonError({ error: 'Corpo da requisição inválido' }, 400); }

  const file       = formData.get('file');
  const settingKey = formData.get('key') as string | null;

  if (!(file instanceof File))                  return jsonError({ error: 'file obrigatório' }, 400);
  if (!settingKey || !VALID_KEYS.has(settingKey)) return jsonError({ error: 'key inválida' }, 400);

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${settingKey}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from('site-images')
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadErr) return jsonError({ error: uploadErr.message }, 500);

  const { error: dbErr } = await admin
    .from('site_settings')
    .upsert({ key: settingKey, value: path, updated_at: new Date().toISOString() });

  if (dbErr) return jsonError({ error: dbErr.message }, 500);

  const url = `${import.meta.env.PUBLIC_SUPABASE_URL as string}/storage/v1/object/public/site-images/${path}`;
  return jsonOk({ path, url });
};
