-- ============================================================
--  Phase 7 Migration — Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS price_tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id              UUID REFERENCES skus(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  variant_a_label     TEXT NOT NULL DEFAULT 'Variant A',
  variant_b_label     TEXT NOT NULL DEFAULT 'Variant B',
  variant_a_price     NUMERIC(10,2) NOT NULL,
  variant_b_price     NUMERIC(10,2) NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE,                          -- NULL = still running
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','ended')),
  price_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 5, -- ±% to match a sale to a variant
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Speed up results attribution queries
CREATE INDEX IF NOT EXISTS idx_price_tests_sku  ON price_tests(sku_id);
CREATE INDEX IF NOT EXISTS idx_price_tests_dates ON price_tests(start_date, end_date);

-- RLS
ALTER TABLE price_tests ENABLE ROW LEVEL SECURITY;
-- Postgres has no "CREATE POLICY IF NOT EXISTS"; drop-then-create makes this re-runnable.
DROP POLICY IF EXISTS "price_tests_all" ON price_tests;
CREATE POLICY "price_tests_all" ON price_tests FOR ALL USING (true) WITH CHECK (true);
