-- ────────────────────────────────────────────────────────────────────────────
-- Storage Buckets + Policies
--
-- Execute no SQL Editor do Supabase APÓS schema.sql e rls.sql.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Bucket: protected-assets ────────────────────────────────────────────────
-- Armazena os assets protegidos do produto. Acesso controlado via signed URLs
-- gerados pelo backend (nunca exposto diretamente ao cliente).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('protected-assets', 'protected-assets', false)
  ON CONFLICT (id) DO NOTHING;

-- Admin pode fazer upload/update/delete
CREATE POLICY "protected-assets: admin insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'protected-assets' AND is_admin());

CREATE POLICY "protected-assets: admin update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'protected-assets' AND is_admin());

CREATE POLICY "protected-assets: admin delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'protected-assets' AND is_admin());

-- Leitura via signed URL (service_role gera o signed URL no backend)
CREATE POLICY "protected-assets: admin select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'protected-assets' AND is_admin());

-- ── Bucket: watermarked ─────────────────────────────────────────────────────
-- Armazena arquivos com watermark do cliente. Gerados sob demanda.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('watermarked', 'watermarked', false)
  ON CONFLICT (id) DO NOTHING;

-- Cliente pode ler apenas seus próprios watermarked files
CREATE POLICY "watermarked: customer select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'watermarked'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Admin pode tudo
CREATE POLICY "watermarked: admin all"
  ON storage.objects FOR ALL
  USING (bucket_id = 'watermarked' AND is_admin());

-- ── Bucket: site-assets ─────────────────────────────────────────────────────
-- Logos, banners, imagens do site. Leitura pública.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('site-assets', 'site-assets', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "site-assets: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-assets');

CREATE POLICY "site-assets: admin write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-assets' AND is_admin());

CREATE POLICY "site-assets: admin update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'site-assets' AND is_admin());

CREATE POLICY "site-assets: admin delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'site-assets' AND is_admin());
