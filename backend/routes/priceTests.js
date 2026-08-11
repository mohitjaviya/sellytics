const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function round2(n) { return Math.round((n || 0) * 100) / 100; }
function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86_400_000) + 1);
}

// ── GET /api/price-tests ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('price_tests')
    .select(`
      id, name, status, variant_a_label, variant_b_label,
      variant_a_price, variant_b_price,
      start_date, end_date, price_tolerance_pct, notes, created_at,
      skus(id, sku_code, name, brands(name))
    `)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── POST /api/price-tests ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    sku_id, name, variant_a_label, variant_b_label,
    variant_a_price, variant_b_price,
    start_date, end_date, price_tolerance_pct, notes, status,
  } = req.body;

  if (!sku_id || !name || !variant_a_price || !variant_b_price || !start_date)
    return res.status(400).json({ error: 'sku_id, name, variant_a_price, variant_b_price, start_date required' });

  const { data, error } = await supabase
    .from('price_tests')
    .insert({
      sku_id,
      name,
      variant_a_label: variant_a_label || 'Variant A',
      variant_b_label: variant_b_label || 'Variant B',
      variant_a_price: parseFloat(variant_a_price),
      variant_b_price: parseFloat(variant_b_price),
      start_date,
      end_date:             end_date || null,
      price_tolerance_pct:  parseFloat(price_tolerance_pct || 5),
      notes:                notes || null,
      status:               status || 'active',
    })
    .select(`
      id, name, status, variant_a_label, variant_b_label,
      variant_a_price, variant_b_price,
      start_date, end_date, price_tolerance_pct, notes, created_at,
      skus(id, sku_code, name, brands(name))
    `)
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PATCH /api/price-tests/:id ────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const allowed = [
    'name','status','end_date','notes',
    'variant_a_label','variant_b_label',
    'variant_a_price','variant_b_price',
    'price_tolerance_pct',
  ];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];

  const { data, error } = await supabase
    .from('price_tests')
    .update(update)
    .eq('id', req.params.id)
    .select(`
      id, name, status, variant_a_label, variant_b_label,
      variant_a_price, variant_b_price,
      start_date, end_date, price_tolerance_pct, notes, created_at,
      skus(id, sku_code, name, brands(name))
    `)
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/price-tests/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('price_tests').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// ── GET /api/price-tests/:id/results ─────────────────────────────────────────
// Attribution:
//   Fetch all sales_orders for the SKU within the test date range.
//   For each order, compute closeness to variant A and B prices.
//   Attribute to whichever is within tolerance_pct; if both in range, pick closer.
//   Orders outside both tolerances go to "unattributed".
router.get('/:id/results', async (req, res) => {
  // 1. Load test
  const { data: test, error: tErr } = await supabase
    .from('price_tests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (tErr || !test) return res.status(404).json({ error: 'Test not found' });

  const endDate = test.end_date || new Date().toISOString().slice(0, 10);
  const tolPct  = parseFloat(test.price_tolerance_pct || 5) / 100;
  const priceA  = parseFloat(test.variant_a_price);
  const priceB  = parseFloat(test.variant_b_price);

  // 2. Fetch orders
  const { data: orders, error: oErr } = await supabase
    .from('sales_orders')
    .select('id, quantity, sale_price, order_date')
    .eq('sku_id', test.sku_id)
    .gte('order_date', test.start_date)
    .lte('order_date', endDate);

  if (oErr) return res.status(500).json({ error: oErr.message });

  // 3. Attribute each order
  const varA = { label: test.variant_a_label, price: priceA, units: 0, revenue: 0, orders: 0, days: {} };
  const varB = { label: test.variant_b_label, price: priceB, units: 0, revenue: 0, orders: 0, days: {} };
  let unattributed = 0;

  for (const o of (orders || [])) {
    const sp      = parseFloat(o.sale_price);
    const qty     = o.quantity || 1;
    const rev     = sp * qty;
    const distA   = Math.abs(sp - priceA) / priceA;
    const distB   = Math.abs(sp - priceB) / priceB;
    const inA     = distA <= tolPct;
    const inB     = distB <= tolPct;

    let bucket;
    if (inA && inB) bucket = distA <= distB ? varA : varB; // closer one wins
    else if (inA)   bucket = varA;
    else if (inB)   bucket = varB;
    else            { unattributed++; continue; }

    bucket.units   += qty;
    bucket.revenue += rev;
    bucket.orders  += 1;
    bucket.days[o.order_date] = (bucket.days[o.order_date] || 0) + 1;
  }

  const days = daysBetween(test.start_date, endDate);

  // 4. Derive daily breakdown aligned on day-index
  const allDates = [
    ...new Set([...Object.keys(varA.days), ...Object.keys(varB.days)])
  ].sort();

  const dailyChart = allDates.map(d => ({
    date: d,
    [`${varA.label} orders`]: varA.days[d] || 0,
    [`${varB.label} orders`]: varB.days[d] || 0,
  }));

  // 5. Stats per variant
  function stats(v) {
    return {
      label:          v.label,
      price:          v.price,
      units:          v.units,
      revenue:        round2(v.revenue),
      orders:         v.orders,
      avg_sale_price: v.orders > 0 ? round2(v.revenue / v.units) : null,
      revenue_per_day: round2(v.revenue / days),
      orders_per_day:  round2(v.orders  / days),
      units_per_day:   round2(v.units   / days),
    };
  }

  const statA = stats(varA);
  const statB = stats(varB);

  // 6. Determine winner across 3 dimensions
  function winnerOf(keyA, keyB) {
    if (!keyA && !keyB) return 'tie';
    if (keyA >  keyB)   return 'A';
    if (keyB >  keyA)   return 'B';
    return 'tie';
  }

  const winners = {
    by_revenue: winnerOf(statA.revenue,        statB.revenue),
    by_units:   winnerOf(statA.units,           statB.units),
    by_velocity: winnerOf(statA.orders_per_day, statB.orders_per_day),
  };

  res.json({
    test,
    variant_a:   statA,
    variant_b:   statB,
    winners,
    unattributed,
    total_orders: (orders || []).length,
    days_elapsed: days,
    date_range:   { from: test.start_date, to: endDate },
    daily_chart:  dailyChart,
    label_a: varA.label,
    label_b: varB.label,
  });
});

module.exports = router;
