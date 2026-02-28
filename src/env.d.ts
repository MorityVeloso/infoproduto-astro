/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { User } from '@supabase/supabase-js';

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string | undefined;
  readonly EMAIL_FROM: string | undefined;
  readonly MERCADOPAGO_ACCESS_TOKEN: string | undefined;
  readonly MERCADOPAGO_PUBLIC_KEY: string | undefined;
  readonly APP_BASE_URL: string | undefined;
  readonly MERCADOPAGO_WEBHOOK_SECRET: string | undefined;
}

declare namespace App {
  interface Locals {
    user: User | null;
  }
}
