// One-off: remove duplicated/inflated Flipkart orders and re-import the sheet
// correctly (per-unit price, deduplicated). Safe to delete after running.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // 1. Flipkart platform
  const { data: plat } = await s.from('platforms').select('id').eq('name', 'Flipkart').single();
  const platformId = plat.id;

  // 2. Wipe existing Flipkart orders (duplicated + wrong price)
  const { data: del } = await s.from('sales_orders').delete().eq('platform_id', platformId).select('id');
  console.log('Deleted', (del || []).length, 'existing Flipkart orders');

  // 3. Resolve/create the "Flipkart Store" account
  let { data: acct } = await s.from('accounts').select('id')
    .eq('account_name', 'Flipkart Store').eq('platform_id', platformId).maybeSingle();
  if (!acct) {
    const { data } = await s.from('accounts').insert({ account_name: 'Flipkart Store', platform_id: platformId }).select('id').single();
    acct = data;
  }

  // 4. Read the sheet + resolve SKUs
  const wb = XLSX.readFile('../flipkart order sheet.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const codes = [...new Set(rows.map(r => String(r['SKU ID']).trim()).filter(Boolean))];
  const { data: skus } = await s.from('skus').select('id, sku_code').in('sku_code', codes);
  const skuMap = {};
  (skus || []).forEach(k => { skuMap[k.sku_code] = k.id; });

  // 5. Build corrected inserts (sale_price = line total / units = PER-UNIT)
  const toInsert = [];
  let skipped = 0;
  for (const r of rows) {
    const code   = String(r['SKU ID']).trim();
    const units  = parseFloat(r['Final Sale Units']) || 0;
    const amount = parseFloat(r['Final Sale Amount']) || 0;
    const skuId  = skuMap[code];
    if (!skuId || units <= 0) { skipped++; continue; }
    toInsert.push({
      sku_id: skuId,
      platform_id: platformId,
      account_id: acct.id,
      city: null,
      quantity: units,
      sale_price: Math.round((amount / units) * 100) / 100,
      order_date: String(r['Order Date']).slice(0, 10),
    });
  }
  const { data: ins, error: insErr } = await s.from('sales_orders').insert(toInsert).select('id');
  if (insErr) { console.error('Insert error:', insErr.message); process.exit(1); }
  console.log('Inserted', (ins || []).length, 'corrected orders (skipped', skipped, 'rows with no SKU / zero units)');

  // 6. Verify
  const { data: chk } = await s.from('sales_orders').select('quantity, sale_price').eq('platform_id', platformId);
  let rev = 0, un = 0;
  for (const o of chk) { rev += (o.quantity || 0) * parseFloat(o.sale_price); un += o.quantity || 0; }
  console.log('Flipkart now: ' + chk.length + ' orders | revenue Rs ' + Math.round(rev) + ' | units ' + un);
})().catch(e => { console.error(e); process.exit(1); });
