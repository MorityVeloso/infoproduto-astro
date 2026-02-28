-- ────────────────────────────────────────────────────────────────────────────
-- infoproduto-astro — Schema base
--
-- Execute no SQL Editor do Supabase ou via supabase db push.
-- Habilite RLS em todas as tabelas antes de ir para produção.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- Espelha auth.users com dados públicos. Criado automaticamente pelo provision-access.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Usuário lê próprio profile"
  on profiles for select
  using (auth.uid() = id);

-- ── Orders ────────────────────────────────────────────────────────────────────
-- Representa cada tentativa de compra (antes e após pagamento).
create table if not exists orders (
  id                  uuid primary key default uuid_generate_v4(),
  customer_id         uuid references auth.users(id) on delete set null,
  customer_email      text not null,
  customer_name       text,
  customer_cpf        text,                               -- opcional, usado pelo Asaas
  status              text not null default 'pending'
                        check (status in (
                          'pending', 'checkout_started', 'paid',
                          'expired', 'canceled', 'refunded', 'failed'
                        )),
  amount_total        numeric(10,2) not null,
  installments        integer not null default 1,
  provider            text not null default 'asaas'
                        check (provider in ('asaas', 'mercadopago', 'manual')),
  provider_payment_id text,
  paid_at             timestamptz,
  email_sent_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()

  -- TODO: Adicione campos específicos do seu produto aqui
  -- Exemplo para produto com variante: variant text
  -- Exemplo para assinatura:          plan_id uuid
);

alter table orders enable row level security;

create policy "Cliente lê próprias orders"
  on orders for select
  using (auth.uid() = customer_id);

create index if not exists idx_orders_customer_id on orders(customer_id);
create index if not exists idx_orders_status       on orders(status);

-- ── Entitlements ──────────────────────────────────────────────────────────────
-- Controla acesso ao produto após pagamento confirmado. Um cliente pode ter
-- entitlements para múltiplos produtos.
create table if not exists entitlements (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid not null references auth.users(id) on delete cascade,
  product_code text not null,    -- deve bater com PRODUCT.code em src/config/product.ts
  active       boolean not null default true,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (customer_id, product_code)
);

alter table entitlements enable row level security;

create policy "Cliente lê próprios entitlements"
  on entitlements for select
  using (auth.uid() = customer_id);

create index if not exists idx_entitlements_customer on entitlements(customer_id);

-- ── Events (analytics de funil) ───────────────────────────────────────────────
create table if not exists events (
  id         bigserial primary key,
  event      text not null,
  session_id text,
  order_id   uuid references orders(id) on delete set null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

alter table events enable row level security;

-- Events são write-only para usuários anônimos (sem leitura via RLS)
create policy "Inserir evento"
  on events for insert
  with check (true);

create index if not exists idx_events_event      on events(event);
create index if not exists idx_events_created_at on events(created_at);

-- ── Site settings ─────────────────────────────────────────────────────────────
create table if not exists site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

-- ── Admin helpers ─────────────────────────────────────────────────────────────
-- Para promover um usuário a admin, após ele criar conta:
-- update profiles set role = 'admin' where email = 'seu@email.com';

-- ── Trigger: updated_at automático ───────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function update_updated_at();
