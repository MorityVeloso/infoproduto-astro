// src/pages/api/models.ts — Public endpoint: returns active models for the landing page
export const prerender = false;

import type { APIRoute } from 'astro';
import { createAdminClient } from '../../lib/supabase/admin';
import { jsonOk, jsonError } from '../../lib/http';

export const GET: APIRoute = async () => {
  const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('models')
    .select('id, name, subtitle, description, colors, tag, tag_color, cover_path')
    .eq('is_active', true)
    .order('sort_order');

  if (error) return jsonError({ error: error.message }, 500);

  const models = (data ?? []).map((m: {
    id: string; name: string; subtitle: string; description: string;
    colors: string[] | null; tag: string | null; tag_color: string | null; cover_path: string | null;
  }) => ({
    ...m,
    coverUrl: m.cover_path
      ? `${SUPABASE_URL}/storage/v1/object/public/model-images/${m.cover_path}`
      : `/images/${m.id}/card.jpg`,
  }));

  return jsonOk({ models });
};
