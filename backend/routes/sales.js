const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const { applyRbac } = require('../middleware/rbacHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate every month between two date strings (YYYY-MM or YYYY-MM-DD), inclusive */
function monthsInRange(from, to) {
  const months = [];
  // Normalise to the first of the month regardless of whether a full date
  // (YYYY-MM-DD) or a month (YYYY-MM) was passed in.
  const cur = new Date(from.slice(0, 7) + '-01');
  const end = new Date(to.slice(0, 7) + '-01');
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 7)); // 'YYYY-MM'
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** Number of months a target covers */
function targetMonthSpan(t) {
  return monthsInRange(t.period_start, t.period_end).length || 1;
}

/** Does a target period overlap with a given month string 'YYYY-MM'? */
function targetCoversMonth(t, month) {
  const monthStart = month + '-01';
  const monthEnd   = month + '-31'; // overshoots fine for comparison
  return t.period_start <= monthEnd && t.period_end >= monthStart;
}

// ── GET /api/sales/cities ─────────────────────────────────────────────────────
router.get('/cities', async (req, res) => {
  let query = supabase
    .from('sales_orders')
    .select('city')
    .not('city', 'is', null);

  query = applyRbac(query, req.user, 'sales_orders');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const cities = [...new Set((data || []).map(r => r.city).filter(Boolean))].sort();
  res.json(cities);
});

// ── GET /api/sales/accounts ───────────────────────────────────────────────────
router.get('/accounts', async (req, res) => {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, account_name, platform_id, platforms(name)')
    .order('account_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/sales/actuals ────────────────────────────────────────────────────
// Aggregate actual sales from sales_orders, grouped by month
// Query params: from, to, sku_id, city, account_id
router.get('/actuals', async (req, res) => {
  const { from, to, sku_id, city, account_id } = req.query;

  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

  let query = supabase
    .from('sales_orders')
    .select('order_date, quantity, sale_price, sku_id, city, account_id')
    .gte('order_date', from)
    .lte('order_date', to)
    .not('order_date', 'is', null);

  if (sku_id)     query = query.eq('sku_id', sku_id);
  if (city)       query = query.eq('city', city);
  if (account_id) query = query.eq('account_id', account_id);

  query = applyRbac(query, req.user, 'sales_orders');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Aggregate by month in JS
  const byMonth = {};
  for (const row of (data || [])) {
    const m = row.order_date.slice(0, 7); // 'YYYY-MM'
    if (!byMonth[m]) byMonth[m] = { month: m, actual_revenue: 0, actual_units: 0, order_count: 0 };
    byMonth[m].actual_revenue += (row.quantity || 0) * (parseFloat(row.sale_price) || 0);
    byMonth[m].actual_units   += row.quantity || 0;
    byMonth[m].order_count    += 1;
  }

  res.json(Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)));
});

// ── GET /api/sales/comparison ─────────────────────────────────────────────────
// Returns merged target vs actual per month — the chart data source
// Query params: from, to, sku_id, city, account_id, target_type
router.get('/comparison', async (req, res) => {
  const { from, to, sku_id, city, account_id, target_type } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

  // ── 1. Fetch matching targets ─────────────────────────────────────────────
  let tQuery = supabase
    .from('targets')
    .select('*')
    .lte('period_start', to)
    .gte('period_end', from);

  if (target_type) tQuery = tQuery.eq('target_type', target_type);
  if (sku_id)      tQuery = tQuery.eq('sku_id', sku_id);
  if (city)        tQuery = tQuery.eq('city', city);
  if (account_id)  tQuery = tQuery.eq('account_id', account_id);
  // For overall targets (no dimension filter), include those too
  if (!sku_id && !city && !account_id && !target_type) {
    // No extra filter — get all targets in range
  }

  // Apply RBAC to targets
  tQuery = applyRbac(tQuery, req.user, 'targets');

  const { data: targets, error: tErr } = await tQuery;
  if (tErr) return res.status(500).json({ error: tErr.message });

  // ── 2. Fetch actuals ──────────────────────────────────────────────────────
  let aQuery = supabase
    .from('sales_orders')
    .select('order_date, quantity, sale_price')
    .gte('order_date', from)
    .lte('order_date', to);

  if (sku_id)     aQuery = aQuery.eq('sku_id', sku_id);
  if (city)       aQuery = aQuery.eq('city', city);
  if (account_id) aQuery = aQuery.eq('account_id', account_id);

  aQuery = applyRbac(aQuery, req.user, 'sales_orders');

  const { data: orders, error: aErr } = await aQuery;
  if (aErr) return res.status(500).json({ error: aErr.message });

  // ── 3. Aggregate actuals by month ─────────────────────────────────────────
  const actualByMonth = {};
  for (const o of (orders || [])) {
    const m = o.order_date.slice(0, 7);
    if (!actualByMonth[m]) actualByMonth[m] = { actual_revenue: 0, actual_units: 0 };
    actualByMonth[m].actual_revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
    actualByMonth[m].actual_units   += o.quantity || 0;
  }

  // ── 4. Build target lookup per month (prorated) ───────────────────────────
  const targetByMonth = {};
  for (const t of (targets || [])) {
    const span     = targetMonthSpan(t);
    const monthRev = parseFloat(t.target_revenue || 0) / span;
    const monthUnt = Math.round((t.target_units  || 0) / span);

    for (const m of monthsInRange(t.period_start, t.period_end)) {
      if (m < from.slice(0, 7) || m > to.slice(0, 7)) continue;
      if (!targetByMonth[m]) targetByMonth[m] = { target_revenue: 0, target_units: 0 };
      targetByMonth[m].target_revenue += monthRev;
      targetByMonth[m].target_units   += monthUnt;
    }
  }

  // ── 5. Merge into sorted month array ─────────────────────────────────────
  const allMonths = monthsInRange(from, to);
  const result = allMonths.map(m => ({
    month:          m,
    month_label:    new Date(m + '-15').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    target_revenue: Math.round(targetByMonth[m]?.target_revenue || 0),
    target_units:   targetByMonth[m]?.target_units   || 0,
    actual_revenue: Math.round(actualByMonth[m]?.actual_revenue || 0),
    actual_units:   actualByMonth[m]?.actual_units   || 0,
    achievement_pct: targetByMonth[m]?.target_revenue > 0
      ? Math.round(((actualByMonth[m]?.actual_revenue || 0) / targetByMonth[m].target_revenue) * 100)
      : null,
  }));

  // ── 6. Summary totals ─────────────────────────────────────────────────────
  const summary = result.reduce((acc, r) => ({
    total_target_revenue: acc.total_target_revenue + r.target_revenue,
    total_actual_revenue: acc.total_actual_revenue + r.actual_revenue,
    total_target_units:   acc.total_target_units   + r.target_units,
    total_actual_units:   acc.total_actual_units   + r.actual_units,
  }), { total_target_revenue: 0, total_actual_revenue: 0, total_target_units: 0, total_actual_units: 0 });

  summary.overall_achievement_pct = summary.total_target_revenue > 0
    ? Math.round((summary.total_actual_revenue / summary.total_target_revenue) * 100)
    : null;

  res.json({ data: result, summary });
});

// ── GET /api/sales/accounts-summary ──────────────────────────────────────────
// Per-account actual revenue vs target in a given period
router.get('/accounts-summary', async (req, res) => {
  const { from, to } = req.query;

  const [{ data: accounts }, { data: orders }, { data: targets }] = await Promise.all([
    supabase.from('accounts').select('id, account_name, platforms(name)'),
    supabase.from('sales_orders').select('account_id, quantity, sale_price, order_date')
      .gte('order_date', from || '2000-01-01')
      .lte('order_date', to   || '2099-12-31')
      .not('account_id', 'is', null),
    supabase.from('targets').select('*')
      .eq('target_type', 'account')
      .lte('period_start', to   || '2099-12-31')
      .gte('period_end',   from || '2000-01-01'),
  ]);

  const revenueByAccount = {};
  for (const o of (orders || [])) {
    if (!o.account_id) continue;
    if (!revenueByAccount[o.account_id]) revenueByAccount[o.account_id] = { actual_revenue: 0, actual_units: 0 };
    revenueByAccount[o.account_id].actual_revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
    revenueByAccount[o.account_id].actual_units   += o.quantity || 0;
  }

  const targetByAccount = {};
  for (const t of (targets || [])) {
    if (!t.account_id) continue;
    if (!targetByAccount[t.account_id]) targetByAccount[t.account_id] = { target_revenue: 0, target_units: 0 };
    targetByAccount[t.account_id].target_revenue += parseFloat(t.target_revenue || 0);
    targetByAccount[t.account_id].target_units   += t.target_units || 0;
  }

  const result = (accounts || []).map(acc => ({
    id:             acc.id,
    account_name:   acc.account_name,
    platform:       acc.platforms?.name ?? '—',
    actual_revenue: Math.round(revenueByAccount[acc.id]?.actual_revenue || 0),
    actual_units:   revenueByAccount[acc.id]?.actual_units   || 0,
    target_revenue: Math.round(targetByAccount[acc.id]?.target_revenue || 0),
    target_units:   targetByAccount[acc.id]?.target_units   || 0,
    achievement_pct: targetByAccount[acc.id]?.target_revenue > 0
      ? Math.round(((revenueByAccount[acc.id]?.actual_revenue || 0) / targetByAccount[acc.id].target_revenue) * 100)
      : null,
  })).filter(a => a.actual_revenue > 0 || a.target_revenue > 0)
     .sort((a, b) => b.actual_revenue - a.actual_revenue);

  res.json(result);
});

// ── GET /api/targets ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { target_type } = req.query;
  let query = supabase
    .from('targets')
    .select(`
      *,
      skus(id, sku_code, name),
      accounts(id, account_name, platforms(name))
    `)
    .order('period_start', { ascending: false });

  if (target_type) query = query.eq('target_type', target_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── POST /api/targets ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    target_type = 'overall', label,
    period_start, period_end, period_type = 'monthly',
    target_revenue, target_units,
    sku_id, city, account_id,
  } = req.body;

  if (!period_start || !period_end)
    return res.status(400).json({ error: 'period_start and period_end are required' });

  const row = {
    target_type,
    label:          label?.trim() || null,
    period_start,
    period_end,
    period_type,
    target_revenue: parseFloat(target_revenue) || 0,
    target_units:   parseInt(target_units) || 0,
    sku_id:         target_type === 'sku'     ? sku_id     : null,
    city:           target_type === 'city'    ? city       : null,
    account_id:     target_type === 'account' ? account_id : null,
  };

  const { data, error } = await supabase.from('targets').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// ── PUT /api/targets/:id ──────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const {
    label, period_start, period_end, period_type,
    target_revenue, target_units, target_type,
    sku_id, city, account_id,
  } = req.body;

  const update = {};
  if (label           !== undefined) update.label          = label?.trim() || null;
  if (period_start    !== undefined) update.period_start   = period_start;
  if (period_end      !== undefined) update.period_end     = period_end;
  if (period_type     !== undefined) update.period_type    = period_type;
  if (target_revenue  !== undefined) update.target_revenue = parseFloat(target_revenue) || 0;
  if (target_units    !== undefined) update.target_units   = parseInt(target_units) || 0;
  if (target_type     !== undefined) update.target_type    = target_type;
  if (sku_id          !== undefined) update.sku_id         = sku_id;
  if (city            !== undefined) update.city           = city;
  if (account_id      !== undefined) update.account_id     = account_id;

  const { data, error } = await supabase.from('targets').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/targets/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('targets').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
