/**
 * admin.ts — Supabase client com service_role key (bypassa RLS).
 * ⚠️  USO EXCLUSIVO EM SERVIDOR (frontmatter .astro, src/pages/api/).
 *     NUNCA importe este arquivo em scripts client-side.
 *
 * A chave SUPABASE_SERVICE_ROLE_KEY não tem prefixo PUBLIC_, portanto
 * o Vite não a inclui no bundle do browser.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL  as string;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!url || !key) {
    throw new Error(
      '[Supabase Admin] PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
