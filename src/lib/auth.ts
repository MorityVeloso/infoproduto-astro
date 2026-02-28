import type { User } from '@supabase/supabase-js';
import { createServerClient } from './supabase/server';

export interface Profile {
  id:         string;
  email:      string;
  role:       'customer' | 'admin';
  created_at: string;
}

/**
 * Retorna o usuário autenticado a partir do request (via cookies).
 * Retorna null se não houver sessão válida.
 */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const { supabase, accessToken } = createServerClient(request);

  if (!supabase || !accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;

  return user;
}

/**
 * Garante que o usuário está autenticado.
 * Retorna { user, redirectUrl: null } se logado.
 * Retorna { user: null, redirectUrl: '/login' } se não logado.
 */
export async function requireUser(request: Request): Promise<{
  user: User | null;
  redirectUrl: string | null;
}> {
  const user = await getUserFromRequest(request);

  if (!user) {
    const currentPath = new URL(request.url).pathname;
    const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}`;
    return { user: null, redirectUrl };
  }

  return { user, redirectUrl: null };
}

/**
 * Verifica se um userId pertence a um usuário admin.
 * Consulta a tabela profiles via server client (anon key + RLS).
 */
export async function isAdmin(request: Request, userId: string): Promise<boolean> {
  const { accessToken } = createServerClient(request);

  if (!accessToken) return false;

  const { supabase: authedClient } = createServerClient(request);
  await authedClient.auth.getUser(accessToken); // valida token

  const { data, error } = await authedClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return false;

  return data.role === 'admin';
}

/**
 * Retorna o profile do usuário a partir do userId.
 * Usa o server client com o access token do request.
 */
export async function getProfile(
  request: Request,
  userId: string
): Promise<Profile | null> {
  const { supabase, accessToken } = createServerClient(request);

  if (!accessToken) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return data as Profile;
}
