require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const migrations = [
  {
    name: 'Phase 3 — low_stock_threshold column',
    sql: `
      ALTER TABLE skus ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
      CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity);
    `,
  },
  {
    name: 'Phase 4 — targets table & city column',
    sql: `
      ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS city TEXT;
    `,
  },
  {
    name: 'Phase 6 — platform commission/shipping columns',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_settings (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE UNIQUE,
        commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
        shipping_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
        updated_at      TIMESTAMPTZ DEFAULT now()
      );
    `,
  },
];

async function run() {
  console.log('Running pending migrations...\n');
  for (const m of migrations) {
    console.log(`⏳  ${m.name}`);
    const { error } = await supabase.rpc('exec_sql', { sql: m.sql }).catch(() => ({ error: { message: 'rpc not available' } }));
    if (error) {
      // Fall back: try each statement individually via raw query
      // Since Supabase JS SDK doesn't expose raw SQL, instruct user
      console.log(`   ⚠️  Cannot auto-run via SDK. Please run in Supabase SQL Editor.`);
    } else {
      console.log(`   ✅  Done`);
    }
  }

  // Test if low_stock_threshold column now exists
  const { error: testErr } = await supabase
    .from('skus')
    .select('low_stock_threshold')
    .limit(1);

  if (testErr) {
    console.log('\n❌ low_stock_threshold column STILL missing.');
    console.log('   → Please run phase3_migration.sql in your Supabase SQL Editor:');
    console.log('   → https://app.supabase.com → SQL Editor → paste contents of phase3_migration.sql\n');
  } else {
    console.log('\n✅ low_stock_threshold column EXISTS — inventory will work correctly!');
  }
}

run().catch(console.error);
