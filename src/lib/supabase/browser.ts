import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.PUBLIC_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[Supabase] PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY são obrigatórias. ' +
    'Verifique seu .env.local.'
  );
}

/**
 * Cria um Supabase client para uso no browser.
 * Gerencia sessão via localStorage automaticamente.
 * Use apenas em scripts client-side (<script> em .astro ou .ts no browser).
 */
export function createBrowserClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
      detectSessionInUrl: true,  // necessário para magic link
    },
  });
}
