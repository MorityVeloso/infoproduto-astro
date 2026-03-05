// src/pages/api/admin/metrics/breakdown.ts
// Breakdown by model/size removed — this endpoint is no longer needed.
// Kept as a stub returning empty data for backward compatibility.
import type { APIRoute } from 'astro';
import { getUserFromRequest, getProfile } from '../../../../lib/auth';

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Não autorizado' }, 401);
  const profile = await getProfile(request, user.id);
  if (!profile || profile.role !== 'admin') return json({ error: 'Proibido' }, 403);

  return json({ byModel: [], bySize: [] }, 200);
};
