import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.PUBLIC_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

/** Parseia a string de cookies do header em um objeto chave-valor. */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}

/**
 * Extrai access_token e refresh_token do cookie de sessão do Supabase.
 *
 * O Supabase JS v2 salva a sessão em um cookie chamado:
 *   sb-<project-ref>-auth-token  (JSON com access_token + refresh_token)
 *
 * Também suportamos o cookie simplificado `sb-access-token` que será
 * definido manualmente pelo nosso handler de magic link.
 */
function extractTokens(cookies: Record<string, string>): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  // 1) Cookie simplificado definido pelo nosso magic link handler
  if (cookies['sb-access-token']) {
    return {
      accessToken:  cookies['sb-access-token'],
      refreshToken: cookies['sb-refresh-token'] ?? null,
    };
  }

  // 2) Cookie padrão do Supabase JS (sb-<ref>-auth-token)
  for (const [key, value] of Object.entries(cookies)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed?.access_token) {
          return {
            accessToken:  parsed.access_token  ?? null,
            refreshToken: parsed.refresh_token ?? null,
          };
        }
      } catch {
        // cookie malformado — ignora
      }
    }
  }

  return { accessToken: null, refreshToken: null };
}

export interface ServerClientResult {
  supabase:     SupabaseClient;
  accessToken:  string | null;
  refreshToken: string | null;
}

/**
 * Cria um Supabase client para uso server-side (Astro SSR / middleware).
 * Lê a sessão dos cookies do request para autenticar o usuário.
 * NÃO persiste sessão nem faz refresh automático (responsabilidade do browser).
 */
export function createServerClient(request: Request): ServerClientResult {
  // Sem env vars configuradas (ex: dev sem .env.local), retorna cliente nulo
  // para que getUserFromRequest retorne null em vez de lançar exceção.
  if (!supabaseUrl || !supabaseAnon) {
    return { supabase: null as unknown as SupabaseClient, accessToken: null, refreshToken: null };
  }

  const cookies      = parseCookies(request.headers.get('cookie'));
  const { accessToken, refreshToken } = extractTokens(cookies);

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { supabase, accessToken, refreshToken };
}
