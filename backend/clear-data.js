require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function clearAll() {
  console.log('🗑️  Clearing all demo data...\n');

  // Delete in reverse dependency order.
  // Table names must match schema.sql / the phase migrations exactly.
  const tables = [
    'price_tests',          // phase7 (the table the app actually uses)
    'price_ab_tests',       // legacy phase-0 table, cleared for completeness
    'ad_spend',
    'targets',
    'sales_orders',
    'inventory',
    'title_image_history',  // was mislabelled 'sku_change_log'
    'sku_checklist',        // was mislabelled 'launch_checklist'
    'platform_sku_mapping',
    'accounts',
    'skus',
    'brands',
    'warehouses',
    'user_assignments',
  ];

  for (const table of tables) {
    const { error, count } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`  ⚠  ${table}: ${error.message}`);
    } else {
      console.log(`  ✓  ${table} cleared`);
    }
  }

  console.log('\n✅ All demo data removed. Platforms are preserved (seeded in schema.sql).');
}

clearAll().catch(err => { console.error(err); process.exit(1); });
