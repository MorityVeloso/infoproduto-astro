-- ────────────────────────────────────────────────────────────────────────────
-- Seed — Produto inicial (placeholder)
--
-- Execute APÓS schema.sql.
-- TODO: Substitua com o nome, descrição e preço do seu produto.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO products (name, description, price, type, is_active, sort_order) VALUES
  ('Meu Produto', 'Descrição do produto.', 97.00, 'main', true, 0)
ON CONFLICT DO NOTHING;

-- Exemplo de order_bump (descomente e ajuste quando necessário):
-- INSERT INTO products (name, description, price, type, is_active, sort_order) VALUES
--   ('Bônus Extra', 'Descrição do bônus.', 47.00, 'order_bump', true, 1)
-- ON CONFLICT DO NOTHING;

-- Settings padrão
INSERT INTO site_settings (key, value) VALUES
  ('whatsapp_number', '"5511999999999"'),
  ('whatsapp_message', '"Olá! Tenho uma dúvida sobre o produto."')
ON CONFLICT (key) DO NOTHING;
