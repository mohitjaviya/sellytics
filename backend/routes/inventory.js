const express = require('express');
const router  = express.Router();
const supabase = require('../lib/supabase');

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function agingBucket(days) {
  if (days <= 30)  return '0–30 days';
  if (days <= 60)  return '31–60 days';
  if (days <= 90)  return '61–90 days';
  return '90+ days';
}

// ── GET /api/inventory ────────────────────────────────────────────────────────
// Full inventory list with SKU details, warehouse details, low-stock flag
router.get('/', async (req, res) => {
  const { warehouse_id, search, low_stock_only } = req.query;

  let query = supabase
    .from('inventory')
    .select(`
      *,
      skus(id, sku_code, name, low_stock_threshold, brands(name)),
      warehouses(id, name, city)
    `)
    .order('quantity', { ascending: true });

  if (warehouse_id) query = query.eq('warehouse_id', warehouse_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let rows = (data || []).map(row => ({
    ...row,
    days_in_warehouse: daysSince(row.last_restocked_at),
    aging_bucket:      agingBucket(daysSince(row.last_restocked_at)),
    is_low_stock:      row.quantity < (row.skus?.low_stock_threshold ?? 10),
  }));

  // Search filter (applied in-memory for simplicity)
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.skus?.sku_code?.toLowerCase().includes(q) ||
      r.skus?.name?.toLowerCase().includes(q)
    );
  }

  if (low_stock_only === 'true') {
    rows = rows.filter(r => r.is_low_stock);
  }

  res.json(rows);
});

// ── GET /api/inventory/alerts ─────────────────────────────────────────────────
// Quick endpoint: just the count + list of low-stock items
router.get('/alerts', async (req, res) => {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, quantity, sku_id, warehouse_id,
      skus(sku_code, name, low_stock_threshold),
      warehouses(name, city)
    `);

  if (error) return res.status(500).json({ error: error.message });

  const alerts = (data || []).filter(r => r.quantity < (r.skus?.low_stock_threshold ?? 10));

  res.json({
    count: alerts.length,
    items: alerts.sort((a, b) => a.quantity - b.quantity),
  });
});

// ── GET /api/inventory/aging ──────────────────────────────────────────────────
// Returns stock aging buckets for the pie chart
router.get('/aging', async (req, res) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('quantity, last_restocked_at');

  if (error) return res.status(500).json({ error: error.message });

  const buckets = {
    '0–30 days':  { units: 0, count: 0 },
    '31–60 days': { units: 0, count: 0 },
    '61–90 days': { units: 0, count: 0 },
    '90+ days':   { units: 0, count: 0 },
  };

  for (const row of (data || [])) {
    const bucket = agingBucket(daysSince(row.last_restocked_at));
    buckets[bucket].units += row.quantity || 0;
    buckets[bucket].count += 1;
  }

  const result = Object.entries(buckets).map(([name, { units, count }]) => ({
    name,
    units,
    count,
  }));

  res.json(result);
});

// ── GET /api/inventory/summary ────────────────────────────────────────────────
// Per-warehouse totals for bar chart
router.get('/summary', async (req, res) => {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      quantity,
      warehouses(id, name, city)
    `);

  if (error) return res.status(500).json({ error: error.message });

  const map = {};
  for (const row of (data || [])) {
    const wh = row.warehouses;
    if (!wh) continue;
    if (!map[wh.id]) map[wh.id] = { id: wh.id, name: wh.name, city: wh.city, total_units: 0, sku_count: 0 };
    map[wh.id].total_units += row.quantity || 0;
    map[wh.id].sku_count   += 1;
  }

  res.json(Object.values(map).sort((a, b) => b.total_units - a.total_units));
});

// ── POST /api/inventory ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { sku_id, warehouse_id, quantity, last_restocked_at } = req.body;
  if (!sku_id || !warehouse_id)
    return res.status(400).json({ error: 'sku_id and warehouse_id are required' });

  const { data, error } = await supabase
    .from('inventory')
    .upsert({
      sku_id,
      warehouse_id,
      quantity: parseInt(quantity) || 0,
      last_restocked_at: last_restocked_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sku_id,warehouse_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PATCH /api/inventory/:id ──────────────────────────────────────────────────
// Inline-edit quantity + optionally update restock date
router.patch('/:id', async (req, res) => {
  const { quantity, last_restocked_at } = req.body;

  const update = { updated_at: new Date().toISOString() };
  if (quantity !== undefined)          update.quantity          = parseInt(quantity);
  if (last_restocked_at !== undefined) update.last_restocked_at = last_restocked_at;

  const { data, error } = await supabase
    .from('inventory')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── GET /api/warehouses ───────────────────────────────────────────────────────
router.get('/warehouses', async (req, res) => {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/warehouses ──────────────────────────────────────────────────────
router.post('/warehouses', async (req, res) => {
  const { name, city, address } = req.body;
  if (!name?.trim() || !city?.trim())
    return res.status(400).json({ error: 'name and city are required' });

  const { data, error } = await supabase
    .from('warehouses')
    .insert({ name: name.trim(), city: city.trim(), address: address?.trim() || null })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PUT /api/warehouses/:id ───────────────────────────────────────────────────
router.put('/warehouses/:id', async (req, res) => {
  const { name, city, address } = req.body;
  const { data, error } = await supabase
    .from('warehouses')
    .update({ name: name?.trim(), city: city?.trim(), address: address?.trim() || null })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/warehouses/:id ────────────────────────────────────────────────
router.delete('/warehouses/:id', async (req, res) => {
  const { error } = await supabase.from('warehouses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── PATCH /api/inventory/threshold/:skuId ────────────────────────────────────
// Update low_stock_threshold on a SKU
router.patch('/threshold/:skuId', async (req, res) => {
  const { threshold } = req.body;
  const val = parseInt(threshold);
  if (isNaN(val) || val < 0)
    return res.status(400).json({ error: 'threshold must be a non-negative integer' });

  const { data, error } = await supabase
    .from('skus')
    .update({ low_stock_threshold: val })
    .eq('id', req.params.skuId)
    .select('id, sku_code, low_stock_threshold')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
