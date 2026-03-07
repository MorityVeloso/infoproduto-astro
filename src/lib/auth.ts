import type { User } from '@supabase/supabase-js';
import { createServerClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

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
 * Usa admin client (service_role) para bypassar RLS — mais robusto que depender do accessToken.
 */
export async function isAdmin(_request: Request, userId: string): Promise<boolean> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return false;

  return data.role === 'admin';
}

/**
 * Retorna o profile do usuário a partir do userId.
 * Usa admin client (service_role) para bypassar RLS.
 */
export async function getProfile(
  _request: Request,
  userId: string
): Promise<Profile | null> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from('profiles')
    .select('id, email, role, created_at')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return data as Profile;
}
