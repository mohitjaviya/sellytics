-- ============================================================
--  Phase 4 Migration — Run in Supabase SQL Editor
-- ============================================================

-- Add target_type to distinguish what dimension the target applies to
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'overall'
    CHECK (target_type IN ('overall', 'sku', 'city', 'account'));

-- Add period_type for display grouping
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly'
    CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom'));

-- Add a human label for the plan
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS label text;

-- Index for fast actuals aggregation
CREATE INDEX IF NOT EXISTS idx_sales_orders_city    ON sales_orders(city);
CREATE INDEX IF NOT EXISTS idx_sales_orders_account ON sales_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_targets_type         ON targets(target_type);
CREATE INDEX IF NOT EXISTS idx_targets_period       ON targets(period_start, period_end);
