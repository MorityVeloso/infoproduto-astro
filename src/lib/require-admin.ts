import type { User } from '@supabase/supabase-js';
import { getUserFromRequest } from './auth';
import { createAdminClient } from './supabase/admin';
import type { Profile } from './auth';

export type { Profile };

export interface AdminContext {
  user:        User;
  profile:     Profile;
  redirectUrl: null;
}

export interface AdminRedirect {
  user:        null;
  profile:     null;
  redirectUrl: string;
}

export type RequireAdminResult = AdminContext | AdminRedirect;

/**
 * Garante que o request vem de um usuário admin.
 * Retorna { user, profile, redirectUrl: null } se autorizado.
 * Retorna { user: null, profile: null, redirectUrl } se não autenticado/autorizado.
 */
export async function requireAdmin(request: Request): Promise<RequireAdminResult> {
  const currentPath = new URL(request.url).pathname;

  const user = await getUserFromRequest(request);
  if (!user) {
    return {
      user:        null,
      profile:     null,
      redirectUrl: `/login?redirect=${encodeURIComponent(currentPath)}`,
    };
  }

  // Usa o admin client para bypassar RLS — o userId já foi verificado acima.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, role, created_at')
    .eq('id', user.id)
    .single();

  if (error || !data || data.role !== 'admin') {
    return { user: null, profile: null, redirectUrl: '/app' };
  }

  return { user, profile: data as Profile, redirectUrl: null };
}
