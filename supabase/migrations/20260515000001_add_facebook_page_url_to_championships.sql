-- Agregar campo Facebook page URL a campeonatos
ALTER TABLE championships ADD COLUMN IF NOT EXISTS facebook_page_url text;
