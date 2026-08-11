-- ============================================================
--  Phase 6 Migration — Run in Supabase SQL Editor
-- ============================================================

-- Add commission % and shipping cost to platforms table (per-platform defaults)
ALTER TABLE platforms
  ADD COLUMN IF NOT EXISTS commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost   NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add per-order overrides on sales_orders (nullable = use platform default)
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS commission_pct  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS shipping_cost   NUMERIC(10,2);

-- Indexes for ad_spend performance queries
CREATE INDEX IF NOT EXISTS idx_ad_spend_platform ON ad_spend(platform_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_sku_date ON ad_spend(sku_id, date);
