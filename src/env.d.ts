/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { User } from '@supabase/supabase-js';

interface ImportMetaEnv {
  // Supabase
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;

  // Asaas (pagamento)
  readonly ASAAS_API_KEY: string;
  readonly ASAAS_SANDBOX: string;
  readonly ASAAS_WEBHOOK_TOKEN: string;

  // Resend (email)
  readonly RESEND_API_KEY: string;
  readonly EMAIL_FROM: string | undefined;

  // App
  readonly APP_BASE_URL: string;

  // WhatsApp
  readonly PUBLIC_WHATSAPP_NUMBER: string | undefined;
}

declare namespace App {
  interface Locals {
    user: User | null;
  }
}
