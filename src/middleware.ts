import { defineMiddleware } from 'astro:middleware';
import { getUserFromRequest, isAdmin } from './lib/auth';

const PROTECTED_PREFIXES = ['/app', '/admin'];
const ADMIN_PREFIXES     = ['/admin'];

/**
 * Middleware de autenticação + autorização.
 * - /app/*   → redireciona para /login se não autenticado
 * - /admin/* → redireciona para /login se não autenticado OU se não for admin
 * - Demais rotas → passa direto
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  );

  if (!isProtected) {
    return next();
  }

  const user = await getUserFromRequest(context.request);

  if (!user) {
    const redirectBack = encodeURIComponent(pathname);
    return context.redirect(`/login?redirect=${redirectBack}`);
  }

  const isAdminRoute = ADMIN_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  );

  if (isAdminRoute) {
    const adminOk = await isAdmin(context.request, user.id);
    if (!adminOk) {
      return context.redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }

  context.locals.user = user;

  return next();
});
