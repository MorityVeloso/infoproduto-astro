/**
 * upload.ts — Admin: upload de arquivo (asset ou cover) para um produto.
 *
 * POST /api/admin/products/upload
 * Body: FormData { file, product_id, asset_type: 'asset' | 'cover' }
 *
 * - asset  → bucket `protected-assets`, path `products/{id}/{filename}`
 * - cover  → bucket `site-assets`,      path `products/{id}/cover.{ext}`
 *
 * Atualiza `asset_path` ou `cover_path` na tabela products.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../../lib/auth';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../../../lib/http';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_ASSET_EXTS = new Set(['pdf', 'zip', 'epub']);
const ALLOWED_COVER_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

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

  const file      = formData.get('file');
  const productId = (formData.get('product_id') as string | null)?.trim();
  const assetType = (formData.get('asset_type') as string | null)?.trim();

  if (!(file instanceof File))           return jsonError({ error: 'file obrigatório' }, 400);
  if (!productId)                        return jsonError({ error: 'product_id obrigatório' }, 400);
  if (assetType !== 'asset' && assetType !== 'cover') {
    return jsonError({ error: 'asset_type deve ser "asset" ou "cover"' }, 400);
  }

  // Validate product exists
  const { data: product } = await admin
    .from('products').select('id').eq('id', productId).single();
  if (!product) return jsonError({ error: 'Produto não encontrado' }, 404);

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return jsonError({ error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 400);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (assetType === 'asset') {
    if (!ALLOWED_ASSET_EXTS.has(ext)) {
      return jsonError({ error: `Extensão não permitida. Use: ${[...ALLOWED_ASSET_EXTS].join(', ')}` }, 400);
    }

    // Sanitize filename: keep only alphanumeric, dash, underscore, dot
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `products/${productId}/${safeName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from('protected-assets')
      .upload(storagePath, bytes, { contentType: file.type, upsert: true });

    if (uploadErr) return jsonError({ error: uploadErr.message }, 500);

    // Update asset_path in products table
    const { error: dbErr } = await admin
      .from('products')
      .update({ asset_path: storagePath, updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (dbErr) return jsonError({ error: dbErr.message }, 500);

    return jsonOk({ ok: true, path: storagePath });

  } else {
    // cover
    if (!ALLOWED_COVER_EXTS.has(ext)) {
      return jsonError({ error: `Extensão não permitida. Use: ${[...ALLOWED_COVER_EXTS].join(', ')}` }, 400);
    }

    const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;
    const storagePath = `products/${productId}/cover.${normalizedExt}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from('site-assets')
      .upload(storagePath, bytes, { contentType: file.type, upsert: true });

    if (uploadErr) return jsonError({ error: uploadErr.message }, 500);

    const publicUrl = `${import.meta.env.PUBLIC_SUPABASE_URL as string}/storage/v1/object/public/site-assets/${storagePath}`;

    const { error: dbErr } = await admin
      .from('products')
      .update({ cover_path: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (dbErr) return jsonError({ error: dbErr.message }, 500);

    return jsonOk({ ok: true, path: publicUrl });
  }
};
