-- ────────────────────────────────────────────────────────────────────────────
-- RLS Policies — Admin + Customer granulares
--
-- Prerequisito: is_admin() function já deve existir (definida em schema.sql).
-- Execute APÓS schema.sql.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Profiles ────────────────────────────────────────────────────────────────

-- Admin pode ler todos os profiles
CREATE POLICY "profiles: admin select all"
  ON profiles FOR SELECT
  USING (is_admin());

-- Admin pode atualizar qualquer profile (promover/rebaixar)
CREATE POLICY "profiles: admin update all"
  ON profiles FOR UPDATE
  USING (is_admin());

-- Cliente pode atualizar o próprio profile (exceto role)
CREATE POLICY "profiles: customer update own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 'customer');

-- ── Orders ──────────────────────────────────────────────────────────────────

-- Admin pode ler todas as orders
CREATE POLICY "orders: admin select all"
  ON orders FOR SELECT
  USING (is_admin());

-- Admin pode atualizar orders (status, etc.)
CREATE POLICY "orders: admin update all"
  ON orders FOR UPDATE
  USING (is_admin());

-- Admin pode inserir orders (manual)
CREATE POLICY "orders: admin insert"
  ON orders FOR INSERT
  WITH CHECK (is_admin());

-- Admin pode deletar orders
CREATE POLICY "orders: admin delete"
  ON orders FOR DELETE
  USING (is_admin());

-- ── Entitlements ────────────────────────────────────────────────────────────

-- Admin CRUD completo
CREATE POLICY "entitlements: admin all"
  ON entitlements FOR ALL
  USING (is_admin());

-- ── Events ──────────────────────────────────────────────────────────────────

-- Admin pode ler todos os eventos (analytics)
CREATE POLICY "events: admin select all"
  ON events FOR SELECT
  USING (is_admin());

-- ── Downloads ───────────────────────────────────────────────────────────────

-- Admin pode ler todos os downloads
CREATE POLICY "downloads: admin select all"
  ON downloads FOR SELECT
  USING (is_admin());

-- Admin pode inserir downloads
CREATE POLICY "downloads: admin insert"
  ON downloads FOR INSERT
  WITH CHECK (is_admin());

-- ── Site Settings ───────────────────────────────────────────────────────────

-- Admin pode ler e modificar site_settings
CREATE POLICY "site_settings: admin all"
  ON site_settings FOR ALL
  USING (is_admin());

-- Leitura pública (anon) para settings como WhatsApp, tema, etc.
CREATE POLICY "site_settings: anon select"
  ON site_settings FOR SELECT
  USING (true);

-- ── Grants para service_role ────────────────────────────────────────────────
-- service_role já bypassa RLS por padrão no Supabase.
-- Estas policies são para o uso via anon/authenticated key.
