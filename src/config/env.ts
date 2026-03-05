/**
 * env.ts — Validação de variáveis de ambiente com Zod.
 *
 * Importar `env` daqui garante que o app falha rápido no boot
 * se alguma variável obrigatória estiver ausente ou inválida.
 *
 * Variáveis PUBLIC_* são acessíveis no client via import.meta.env.
 * Variáveis sem prefixo são server-only.
 */

import { z } from 'zod';

// ── Schema ────────────────────────────────────────────────────

const serverSchema = z.object({
  // Supabase (server-only)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY ausente'),

  // Asaas
  ASAAS_API_KEY: z.string().min(1, 'ASAAS_API_KEY ausente'),
  ASAAS_SANDBOX: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ASAAS_WEBHOOK_TOKEN: z.string().min(1, 'ASAAS_WEBHOOK_TOKEN ausente'),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY ausente'),
  EMAIL_FROM: z.string().optional(),

  // App
  APP_BASE_URL: z.string().url('APP_BASE_URL deve ser uma URL válida'),
});

const publicSchema = z.object({
  PUBLIC_SUPABASE_URL: z.string().url('PUBLIC_SUPABASE_URL deve ser uma URL válida'),
  PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'PUBLIC_SUPABASE_ANON_KEY ausente'),
  PUBLIC_WHATSAPP_NUMBER: z.string().optional().default(''),
});

// ── Parse ─────────────────────────────────────────────────────

function parseEnv() {
  const meta = import.meta.env;

  const server = serverSchema.safeParse(meta);
  const pub = publicSchema.safeParse(meta);

  const errors: string[] = [];

  if (!server.success) {
    errors.push(
      ...server.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    );
  }
  if (!pub.success) {
    errors.push(
      ...pub.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `\n\nVariáveis de ambiente inválidas:\n${errors.join('\n')}\n\nVerifique seu .env.local\n`
    );
  }

  return {
    ...server.data!,
    ...pub.data!,
  };
}

export const env = parseEnv();

export type Env = typeof env;
