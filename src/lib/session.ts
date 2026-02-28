/**
 * session.ts — helpers de cookie para sincronizar sessão Supabase (browser-only).
 *
 * Por que cookies?
 * O Supabase JS v2 armazena sessão em localStorage por padrão, mas nosso
 * middleware SSR lê cookies para autenticar. Este módulo sincroniza os tokens
 * para cookies acessíveis ao servidor sem precisar do pacote @supabase/ssr.
 *
 * IMPORTANTE: use apenas em scripts client-side (nunca no frontmatter Astro SSR).
 */

import type { Session } from '@supabase/supabase-js';

const COOKIE_OPTS = 'path=/; samesite=lax';

/** Grava access_token e refresh_token em cookies legíveis pelo servidor. */
export function syncSessionToCookies(session: Session): void {
  const expires = new Date(session.expires_at! * 1000).toUTCString();
  document.cookie = `sb-access-token=${session.access_token}; ${COOKIE_OPTS}; expires=${expires}`;
  document.cookie = `sb-refresh-token=${session.refresh_token}; ${COOKIE_OPTS}`;
}

/** Remove os cookies de sessão (usado no logout). */
export function clearSessionCookies(): void {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = `sb-access-token=; ${COOKIE_OPTS}; expires=${past}`;
  document.cookie = `sb-refresh-token=; ${COOKIE_OPTS}; expires=${past}`;
}
