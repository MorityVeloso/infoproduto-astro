// src/pages/api/admin/models/upload-url.ts
// Admin-only: gera URL assinada para upload direto ao Supabase Storage.
// O browser faz o PUT direto ao Supabase (bypassa Cloudflare WAF).
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { model_id, asset_type, size } = body;

  if (!model_id || typeof model_id !== 'string' || !model_id.trim()) {
    return jsonError({ error: 'model_id obrigatório' }, 400);
  }
  if (!asset_type || typeof asset_type !== 'string' || !(asset_type in ASSET_MAP)) {
    return jsonError({ error: 'asset_type inválido' }, 400);
  }
  if (SIZE_REQUIRED.has(asset_type) && (!size || typeof size !== 'string' || !VALID_SIZES.has(size as string))) {
    return jsonError({ error: 'size obrigatório para este asset_type (P, M ou G)' }, 400);
  }

  const { bucket, pathFn } = ASSET_MAP[asset_type];
  const path = pathFn(model_id.trim(), typeof size === 'string' ? size : undefined);

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) return jsonError({ error: error?.message ?? 'Falha ao gerar URL de upload' }, 500);

  return jsonOk({ ok: true, signedUrl: data.signedUrl, path, bucket, asset_type });
};
