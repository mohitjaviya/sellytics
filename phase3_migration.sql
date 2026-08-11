-- ============================================================
--  Phase 3 Migration — Run in Supabase SQL Editor
-- ============================================================

-- Add low_stock_threshold to skus (default 10 units)
ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;

-- Ensure updated_at exists on inventory (should already be there)
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Index for fast low-stock queries
CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity);
