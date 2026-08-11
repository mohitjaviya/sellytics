const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve platform name → id, create if missing for 'owned' */
async function resolvePlatforms(names) {
  const unique = [...new Set(names.filter(Boolean))];
  const { data } = await supabase.from('platforms').select('id,name').in('name', unique);
  const map = {};
  (data || []).forEach(p => { map[p.name.toLowerCase()] = p.id; });
  return map;
}

/** Resolve warehouse name → id, auto-create unknown warehouses */
async function resolveWarehouses(names) {
  const unique = [...new Set(names.filter(Boolean))];
  const { data: existing } = await supabase.from('warehouses').select('id,name').in('name', unique);
  const map = {};
  (existing || []).forEach(w => { map[w.name.toLowerCase()] = w.id; });

  const missing = unique.filter(n => !map[n.toLowerCase()]);
  for (const name of missing) {
    const { data: created } = await supabase
      .from('warehouses')
      .insert({ name, city: 'Unknown' })
      .select('id,name')
      .single();
    if (created) map[created.name.toLowerCase()] = created.id;
  }
  return map;
}

/** Resolve SKU codes → id map */
async function resolveSkus(codes) {
  const unique = [...new Set(codes.filter(Boolean))];
  const { data } = await supabase.from('skus').select('id,sku_code').in('sku_code', unique);
  const map = {};
  (data || []).forEach(s => { map[s.sku_code] = s.id; });
  return map;
}

/** Resolve or create account by name + platform_id */
async function resolveAccounts(rows) {
  const map = {};
  for (const { account_name, platform_id } of rows) {
    if (!account_name || !platform_id) continue;
    const key = `${account_name}::${platform_id}`;
    if (map[key]) continue;
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('account_name', account_name)
      .eq('platform_id', platform_id)
      .maybeSingle();
    if (existing) {
      map[key] = existing.id;
    } else {
      const { data: created } = await supabase
        .from('accounts')
        .insert({ account_name, platform_id })
        .select('id')
        .single();
      if (created) map[key] = created.id;
    }
  }
  return map;
}

function requireFields(row, fields, idx) {
  const missing = fields.filter(f => !row[f] && row[f] !== 0);
  if (missing.length) return `Row ${idx + 1}: missing ${missing.join(', ')}`;
  return null;
}

function parseNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// ── POST /api/import/skus ────────────────────────────────────────────────────
router.post('/skus', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const errors   = [];
  const toInsert = [];

  // Collect unique brand names and upsert
  const brandNames = [...new Set(rows.map(r => r.brand_name).filter(Boolean))];
  const brandMap   = {};
  if (brandNames.length) {
    for (const name of brandNames) {
      const { data } = await supabase
        .from('brands')
        .upsert({ name }, { onConflict: 'name' })
        .select('id,name')
        .single();
      if (data) brandMap[name.toLowerCase()] = data.id;
    }
  }

  rows.forEach((row, idx) => {
    const err = requireFields(row, ['sku_code', 'name'], idx);
    if (err) { errors.push(err); return; }

    const cost_price = parseNum(row.cost_price);
    const mrp        = parseNum(row.mrp);

    if (cost_price === null || mrp === null) {
      errors.push(`Row ${idx + 1}: cost_price and mrp must be numbers`);
      return;
    }

    toInsert.push({
      sku_code:   String(row.sku_code).trim(),
      name:       String(row.name).trim(),
      brand_id:   brandMap[String(row.brand_name || '').toLowerCase()] ?? null,
      category:   row.category ? String(row.category).trim() : null,
      cost_price,
      mrp,
    });
  });

  if (toInsert.length === 0)
    return res.json({ inserted: 0, errors });

  // Upsert (on conflict sku_code → update)
  const { data, error } = await supabase
    .from('skus')
    .upsert(toInsert, { onConflict: 'sku_code' })
    .select('id');

  if (error) return res.status(500).json({ error: error.message, errors });

  res.json({ inserted: (data || []).length, skipped: rows.length - toInsert.length, errors });
});

// ── POST /api/import/sales-orders ────────────────────────────────────────────
router.post('/sales-orders', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const errors = [];
  const valid  = [];

  // Pre-resolve lookup maps
  const platformMap  = await resolvePlatforms(rows.map(r => r.platform_name));
  const warehouseMap = await resolveWarehouses(rows.map(r => r.warehouse_name));
  const skuMap       = await resolveSkus(rows.map(r => r.sku_code));

  // Resolve accounts
  const accountInputs = rows.map(r => ({
    account_name: r.account_name,
    platform_id:  platformMap[String(r.platform_name || '').toLowerCase()],
  }));
  const accountMap = await resolveAccounts(accountInputs);

  rows.forEach((row, idx) => {
    const err = requireFields(row, ['sku_code', 'platform_name', 'quantity', 'sale_price', 'order_date'], idx);
    if (err) { errors.push(err); return; }

    const sku_id      = skuMap[String(row.sku_code).trim()];
    const platform_id = platformMap[String(row.platform_name || '').toLowerCase()];
    const warehouse_id = row.warehouse_name
      ? warehouseMap[String(row.warehouse_name).toLowerCase()]
      : null;
    const account_key = `${row.account_name}::${platform_id}`;
    const account_id  = accountMap[account_key] ?? null;
    const quantity    = parseInt(row.quantity, 10);
    const sale_price  = parseNum(row.sale_price);
    const order_date  = parseDate(row.order_date);

    if (!sku_id)      { errors.push(`Row ${idx + 1}: SKU "${row.sku_code}" not found — import SKUs first`); return; }
    if (!platform_id) { errors.push(`Row ${idx + 1}: Platform "${row.platform_name}" not found`); return; }
    if (isNaN(quantity) || quantity <= 0) { errors.push(`Row ${idx + 1}: quantity must be a positive integer`); return; }
    if (sale_price === null) { errors.push(`Row ${idx + 1}: sale_price must be a number`); return; }
    if (!order_date) { errors.push(`Row ${idx + 1}: order_date invalid (use YYYY-MM-DD)`); return; }

    valid.push({ sku_id, platform_id, warehouse_id, account_id,
      city:       row.city ? String(row.city).trim() : null,
      quantity, sale_price, order_date });
  });

  if (valid.length === 0) return res.json({ inserted: 0, errors });

  // Batch insert in chunks of 500
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('sales_orders').insert(chunk).select('id');
    if (error) errors.push(`Batch ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
    else inserted += (data || []).length;
  }

  res.json({ inserted, skipped: rows.length - valid.length, errors });
});

// ── POST /api/import/inventory ───────────────────────────────────────────────
router.post('/inventory', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const errors = [];
  const valid  = [];

  const skuMap       = await resolveSkus(rows.map(r => r.sku_code));
  const warehouseMap = await resolveWarehouses(rows.map(r => r.warehouse_name));

  rows.forEach((row, idx) => {
    const err = requireFields(row, ['sku_code', 'warehouse_name', 'quantity'], idx);
    if (err) { errors.push(err); return; }

    const sku_id      = skuMap[String(row.sku_code).trim()];
    const warehouse_id = warehouseMap[String(row.warehouse_name || '').toLowerCase()];
    const quantity    = parseInt(row.quantity, 10);

    if (!sku_id)      { errors.push(`Row ${idx + 1}: SKU "${row.sku_code}" not found`); return; }
    if (!warehouse_id){ errors.push(`Row ${idx + 1}: Warehouse "${row.warehouse_name}" could not be created`); return; }
    if (isNaN(quantity) || quantity < 0) { errors.push(`Row ${idx + 1}: quantity must be a non-negative integer`); return; }

    const last_restocked_at = parseDate(row.last_restocked_at) ?? new Date().toISOString();

    valid.push({ sku_id, warehouse_id, quantity, last_restocked_at });
  });

  if (valid.length === 0) return res.json({ inserted: 0, errors });

  const { data, error } = await supabase
    .from('inventory')
    .upsert(valid, { onConflict: 'sku_id,warehouse_id' })
    .select('id');

  if (error) return res.status(500).json({ error: error.message, errors });

  res.json({ inserted: (data || []).length, skipped: rows.length - valid.length, errors });
});

// ── POST /api/import/ad-spend ────────────────────────────────────────────────
router.post('/ad-spend', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const errors = [];
  const valid  = [];

  const skuMap      = await resolveSkus(rows.map(r => r.sku_code));
  const platformMap = await resolvePlatforms(rows.map(r => r.platform_name));

  rows.forEach((row, idx) => {
    const err = requireFields(row, ['sku_code', 'platform_name', 'date', 'amount'], idx);
    if (err) { errors.push(err); return; }

    const sku_id      = skuMap[String(row.sku_code).trim()];
    const platform_id = platformMap[String(row.platform_name || '').toLowerCase()];
    const date        = parseDate(row.date);
    const amount      = parseNum(row.amount);
    const rev         = parseNum(row.revenue_attributed) ?? 0;

    if (!sku_id)      { errors.push(`Row ${idx + 1}: SKU "${row.sku_code}" not found`); return; }
    if (!platform_id) { errors.push(`Row ${idx + 1}: Platform "${row.platform_name}" not found`); return; }
    if (!date)        { errors.push(`Row ${idx + 1}: date invalid (use YYYY-MM-DD)`); return; }
    if (amount === null) { errors.push(`Row ${idx + 1}: amount must be a number`); return; }

    valid.push({ sku_id, platform_id, date, amount, revenue_attributed: rev });
  });

  if (valid.length === 0) return res.json({ inserted: 0, errors });

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const { data, error } = await supabase.from('ad_spend').insert(valid.slice(i, i + CHUNK)).select('id');
    if (error) errors.push(`Batch error: ${error.message}`);
    else inserted += (data || []).length;
  }

  res.json({ inserted, skipped: rows.length - valid.length, errors });
});

// ── POST /api/import/validate (preview-only, no insert) ─────────────────────
router.post('/validate', async (req, res) => {
  const { type, rows } = req.body;
  const REQUIRED = {
    skus:         ['sku_code', 'name', 'cost_price', 'mrp'],
    'sales-orders': ['sku_code', 'platform_name', 'quantity', 'sale_price', 'order_date'],
    inventory:    ['sku_code', 'warehouse_name', 'quantity'],
    'ad-spend':   ['sku_code', 'platform_name', 'date', 'amount'],
  };

  const required = REQUIRED[type];
  if (!required) return res.status(400).json({ error: `Unknown type: ${type}` });
  if (!Array.isArray(rows) || rows.length === 0) return res.json({ errors: [], valid: 0 });

  // Check if SKUs exist for non-sku imports
  let skuMap = {};
  if (type !== 'skus') {
    skuMap = await resolveSkus(rows.map(r => r.sku_code));
  }

  const errors = [];
  let valid = 0;

  rows.forEach((row, idx) => {
    const rowErrors = [];
    required.forEach(f => {
      if (!row[f] && row[f] !== 0) rowErrors.push(`missing "${f}"`);
    });

    if (type !== 'skus' && row.sku_code && !skuMap[String(row.sku_code).trim()]) {
      rowErrors.push(`SKU "${row.sku_code}" not in database`);
    }

    if (rowErrors.length) {
      errors.push({ row: idx + 1, issues: rowErrors });
    } else {
      valid++;
    }
  });

  res.json({ errors, valid, total: rows.length });
});

module.exports = router;
