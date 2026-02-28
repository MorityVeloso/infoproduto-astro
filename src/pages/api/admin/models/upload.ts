// src/pages/api/admin/models/upload.ts
// Admin-only: uploads a file to Supabase Storage and optionally updates models.cover_path.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

type AssetEntry = { bucket: string; pathFn: (model: string, size?: string) => string };

const ASSET_MAP: Record<string, AssetEntry> = {
  cover_image:   { bucket: 'model-images',     pathFn: (m)    => `${m}/card.webp` },
  shopping_list: { bucket: 'protected-assets', pathFn: (m)    => `kit/${m}/lista-compras.pdf` },
  bonus:         { bucket: 'protected-assets', pathFn: (m)    => `kit/${m}/bonus.pdf` },
  order_bump:    { bucket: 'protected-assets', pathFn: (m)    => `kit/${m}/order-bump.pdf` },
  project_pdf:   { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/projeto_base.pdf` },
  render_1:      { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/renders/01.webp` },
  render_2:      { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/renders/02.webp` },
  render_3:      { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/renders/03.webp` },
  render_4:      { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/renders/04.webp` },
  renders_zip:   { bucket: 'protected-assets', pathFn: (m, s) => `kit/${m}/${s}/renders.zip` },
};

const SIZE_REQUIRED = new Set(['project_pdf', 'render_1', 'render_2', 'render_3', 'render_4', 'renders_zip']);
const VALID_SIZES   = new Set(['P', 'M', 'G']);

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
  const model_id   = formData.get('model_id')   as string | null;
  const asset_type = formData.get('asset_type') as string | null;
  const size       = formData.get('size')       as string | null;

  if (!(file instanceof File)) return jsonError({ error: 'file obrigatório' }, 400);
  if (!model_id?.trim())       return jsonError({ error: 'model_id obrigatório' }, 400);
  if (!asset_type || !(asset_type in ASSET_MAP)) return jsonError({ error: 'asset_type inválido' }, 400);
  if (SIZE_REQUIRED.has(asset_type) && !VALID_SIZES.has(size ?? '')) {
    return jsonError({ error: 'size obrigatório para este asset_type (P, M ou G)' }, 400);
  }

  const { bucket, pathFn } = ASSET_MAP[asset_type];
  const path = pathFn(model_id.trim(), size ?? undefined);
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from(bucket)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadErr) return jsonError({ error: uploadErr.message }, 500);

  // If cover image, update models.cover_path automatically
  if (asset_type === 'cover_image') {
    await admin.from('models').update({ cover_path: path }).eq('id', model_id.trim());
  }

  const url = bucket === 'model-images'
    ? `${import.meta.env.PUBLIC_SUPABASE_URL as string}/storage/v1/object/public/${bucket}/${path}`
    : undefined;

  return jsonOk({ path, url });
};
