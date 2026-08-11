-- ============================================================
--  Phase 2 Additions — Run in Supabase SQL Editor
-- ============================================================

-- 1. Create sku-images storage bucket (run via Supabase Dashboard)
--    Go to Storage → Create bucket → Name: "sku-images" → Public: YES
--    OR run via API:

-- insert into storage.buckets (id, name, public)
-- values ('sku-images', 'sku-images', true)
-- on conflict (id) do nothing;

-- 2. Storage RLS — allow authenticated uploads
-- create policy "Auth users can upload sku images"
--   on storage.objects for insert
--   with check (bucket_id = 'sku-images' AND auth.role() = 'authenticated');

-- create policy "Public can read sku images"
--   on storage.objects for select
--   using (bucket_id = 'sku-images');

-- ============================================================
--  The sku_checklist and title_image_history tables were
--  already created in schema.sql (Phase 0). No new tables needed.
-- ============================================================
