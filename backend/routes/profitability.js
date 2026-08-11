const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const { applyRbac } = require('../middleware/rbacHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────
function round2(n) { return Math.round((n || 0) * 100) / 100; }
function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1);
}

/** Aggregate ad spend by (sku_id, platform_id) for a date range */
async function fetchAdSpend(from, to) {
  const { data, error } = await supabase
    .from('ad_spend')
    .select('sku_id, platform_id, amount, revenue_attributed, date')
    .gte('date', from)
    .lte('date', to);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Fetch platforms with their default commission/shipping */
async function fetchPlatforms() {
  const { data } = await supabase.from('platforms').select('id, name, commission_pct, shipping_cost');
  const map = {};
  for (const p of (data || [])) map[p.id] = p;
  return map;
}

// ── GET /api/profitability/platform-settings ───────────────────────────────
// List all platforms with current commission/shipping settings
router.get('/platform-settings', async (req, res) => {
  const { data, error } = await supabase
    .from('platforms')
    .select('id, name, commission_pct, shipping_cost')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── PATCH /api/profitability/platform-settings/:id ────────────────────────
// Update a platform's commission % and/or shipping cost
router.patch('/platform-settings/:id', async (req, res) => {
  const { commission_pct, shipping_cost } = req.body;
  const update = {};
  if (commission_pct !== undefined) update.commission_pct = parseFloat(commission_pct) || 0;
  if (shipping_cost  !== undefined) update.shipping_cost  = parseFloat(shipping_cost)  || 0;

  const { data, error } = await supabase
    .from('platforms')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── GET /api/profitability/sku ────────────────────────────────────────────────
// Profit per SKU:
//   gross_profit   = sale_price − cost_price
//   commission_amt = sale_price × effective_commission_pct
//   shipping_amt   = effective_shipping_cost (order override → platform default)
//   ad_alloc       = total ad spend for SKU in period / total units sold
//   net_profit     = gross_profit − commission_amt − shipping_amt − ad_alloc
router.get('/sku', async (req, res) => {
  const { from, to, platform_id, limit = 50 } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const platforms = await fetchPlatforms();

    // Fetch orders with full cost data
    let ordersQ = supabase
      .from('sales_orders')
      .select(`
        id, sku_id, platform_id, quantity, sale_price,
        commission_pct, shipping_cost,
        skus(id, sku_code, name, cost_price, brand_id, brands(name)),
        platforms(id, name, commission_pct, shipping_cost)
      `)
      .gte('order_date', from)
      .lte('order_date', to);

    if (platform_id) ordersQ = ordersQ.eq('platform_id', platform_id);

    ordersQ = applyRbac(ordersQ, req.user, 'sales_orders');

    const { data: orders, error: oErr } = await ordersQ;
    if (oErr) throw new Error(oErr.message);

    // Fetch ad spend aggregated by SKU in period
    const adRows   = await fetchAdSpend(from, to);
    const adBySkuPlat = {};
    for (const a of adRows) {
      const k = `${a.sku_id}::${a.platform_id}`;
      if (!adBySkuPlat[k]) adBySkuPlat[k] = { amount: 0, revenue_attributed: 0 };
      adBySkuPlat[k].amount             += parseFloat(a.amount) || 0;
      adBySkuPlat[k].revenue_attributed += parseFloat(a.revenue_attributed) || 0;
    }
    const adBySku = {};
    for (const [k, v] of Object.entries(adBySkuPlat)) {
      const skuId = k.split('::')[0];
      if (!adBySku[skuId]) adBySku[skuId] = { amount: 0, revenue_attributed: 0 };
      adBySku[skuId].amount             += v.amount;
      adBySku[skuId].revenue_attributed += v.revenue_attributed;
    }

    // Aggregate per SKU
    const bySkuId = {};
    for (const o of (orders || [])) {
      const skuId     = o.sku_id;
      const qty       = o.quantity    || 1;
      const salePrice = parseFloat(o.sale_price  || 0);
      const costPrice = parseFloat(o.skus?.cost_price || 0);

      // Commission: use order override if set, else platform default
      const commPct = o.commission_pct !== null && o.commission_pct !== undefined
        ? parseFloat(o.commission_pct)
        : parseFloat(o.platforms?.commission_pct || 0);

      // Shipping: per-order override or platform default
      const shipCost = o.shipping_cost !== null && o.shipping_cost !== undefined
        ? parseFloat(o.shipping_cost)
        : parseFloat(o.platforms?.shipping_cost || 0);

      const commAmt    = salePrice * (commPct / 100);
      const grossProfit = salePrice - costPrice;
      const deductions  = commAmt + shipCost; // ad spend added below after aggregation

      if (!bySkuId[skuId]) bySkuId[skuId] = {
        sku_id: skuId,
        sku_code:  o.skus?.sku_code ?? '—',
        sku_name:  o.skus?.name     ?? '—',
        brand:     o.skus?.brands?.name ?? '—',
        cost_price: costPrice,
        total_revenue: 0, total_units: 0, order_count: 0,
        total_cost: 0, total_commission: 0, total_shipping: 0,
        gross_profit_sum: 0,
      };
      bySkuId[skuId].total_revenue     += salePrice * qty;
      bySkuId[skuId].total_units       += qty;
      bySkuId[skuId].order_count       += 1;
      bySkuId[skuId].total_cost        += costPrice * qty;
      bySkuId[skuId].total_commission  += commAmt * qty;
      bySkuId[skuId].total_shipping    += shipCost * qty;
      bySkuId[skuId].gross_profit_sum  += grossProfit * qty;
    }

    // Apply ad spend + compute net profit
    const result = Object.values(bySkuId)
      .map(s => {
        const adSpend  = adBySku[s.sku_id]?.amount || 0;
        const adPerUnit = s.total_units > 0 ? adSpend / s.total_units : 0;
        const netProfit = s.gross_profit_sum - s.total_commission - s.total_shipping - adSpend;
        const margin    = s.total_revenue > 0 ? round2((netProfit / s.total_revenue) * 100) : 0;
        const acos      = adSpend > 0 && s.total_revenue > 0 ? round2((adSpend / s.total_revenue) * 100) : null;
        const roas      = adSpend > 0 ? round2(s.total_revenue / adSpend) : null;

        return {
          ...s,
          ad_spend:         round2(adSpend),
          ad_per_unit:      round2(adPerUnit),
          net_profit:       round2(netProfit),
          net_profit_unit:  s.total_units > 0 ? round2(netProfit / s.total_units) : 0,
          gross_margin_pct: round2(s.total_revenue > 0 ? (s.gross_profit_sum / s.total_revenue) * 100 : 0),
          net_margin_pct:   margin,
          acos,
          roas,
          total_revenue:    round2(s.total_revenue),
          gross_profit_sum: round2(s.gross_profit_sum),
          total_commission: round2(s.total_commission),
          total_shipping:   round2(s.total_shipping),
        };
      })
      .sort((a, b) => b.net_profit - a.net_profit)
      .slice(0, parseInt(limit));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/profitability/roas ───────────────────────────────────────────────
// ROAS (Return on Ad Spend) chart data: ad spend vs attributed revenue per period
// Filterable by sku_id, platform_id
// Returns monthly breakdown + top SKUs by ROAS + bottom SKUs by ROAS
router.get('/roas', async (req, res) => {
  const { from, to, sku_id, platform_id } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    // Fetch ad spend rows
    let adQ = supabase
      .from('ad_spend')
      .select(`
        sku_id, platform_id, amount, revenue_attributed, date,
        skus(id, sku_code, name),
        platforms(id, name)
      `)
      .gte('date', from)
      .lte('date', to);

    if (sku_id)     adQ = adQ.eq('sku_id', sku_id);
    if (platform_id) adQ = adQ.eq('platform_id', platform_id);

    const { data: adRows, error } = await adQ;
    if (error) throw new Error(error.message);

    // Monthly aggregation for chart
    const byMonth = {};
    const bySku   = {};
    const byPlat  = {};

    for (const a of (adRows || [])) {
      const m     = a.date.slice(0, 7);
      const spend = parseFloat(a.amount || 0);
      const rev   = parseFloat(a.revenue_attributed || 0);

      // Monthly
      if (!byMonth[m]) byMonth[m] = { month: m, month_label: new Date(m + '-15').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), ad_spend: 0, revenue_attributed: 0 };
      byMonth[m].ad_spend           += spend;
      byMonth[m].revenue_attributed += rev;

      // Per SKU totals
      const skuId = a.sku_id;
      if (skuId) {
        if (!bySku[skuId]) bySku[skuId] = { sku_id: skuId, sku_code: a.skus?.sku_code ?? '—', sku_name: a.skus?.name ?? '—', ad_spend: 0, revenue_attributed: 0 };
        bySku[skuId].ad_spend           += spend;
        bySku[skuId].revenue_attributed += rev;
      }

      // Per platform totals
      const platId = a.platform_id;
      if (platId) {
        if (!byPlat[platId]) byPlat[platId] = { platform_id: platId, platform_name: a.platforms?.name ?? '—', ad_spend: 0, revenue_attributed: 0 };
        byPlat[platId].ad_spend           += spend;
        byPlat[platId].revenue_attributed += rev;
      }
    }

    function addRoas(rows) {
      return Object.values(rows).map(r => ({
        ...r,
        ad_spend:           round2(r.ad_spend),
        revenue_attributed: round2(r.revenue_attributed),
        roas: r.ad_spend > 0 ? round2(r.revenue_attributed / r.ad_spend) : null,
        acos: r.revenue_attributed > 0 ? round2((r.ad_spend / r.revenue_attributed) * 100) : null,
      }));
    }

    const monthlyChart = addRoas(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    const skuBreakdown  = addRoas(bySku).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    const platBreakdown = addRoas(byPlat).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));

    // Totals
    const totalSpend = round2(monthlyChart.reduce((a, r) => a + r.ad_spend, 0));
    const totalRev   = round2(monthlyChart.reduce((a, r) => a + r.revenue_attributed, 0));

    res.json({
      monthly:    monthlyChart,
      by_sku:     skuBreakdown,
      by_platform: platBreakdown,
      totals: {
        ad_spend:           totalSpend,
        revenue_attributed: totalRev,
        roas: totalSpend > 0 ? round2(totalRev / totalSpend) : null,
        acos: totalRev   > 0 ? round2((totalSpend / totalRev) * 100) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/profitability/high-burn ──────────────────────────────────────────
// High-burning SKU report:
//   Signal 1 (ACoS): ad_spend / revenue > acos_threshold (default 30%)
//   Signal 2 (Depletion): 7-day velocity > 2x the 30-day rolling baseline
//   Both signals shown independently; thresholds configurable via query params
router.get('/high-burn', async (req, res) => {
  const {
    from, to,
    acos_threshold  = 30,    // % — flag if ACoS exceeds this
    depletion_ratio = 2.0,   // flag if 7d velocity > ratio × 30d avg
  } = req.query;

  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const acosThresh  = parseFloat(acos_threshold);
    const deplRatio   = parseFloat(depletion_ratio);

    // ── Signal 1: High ACoS ───────────────────────────────────────────────
    const adRows = await fetchAdSpend(from, to);

    const adBySku = {};
    for (const a of adRows) {
      const id = a.sku_id;
      if (!id) continue;
      if (!adBySku[id]) adBySku[id] = { ad_spend: 0, revenue_attributed: 0 };
      adBySku[id].ad_spend           += parseFloat(a.amount || 0);
      adBySku[id].revenue_attributed += parseFloat(a.revenue_attributed || 0);
    }

    // Also fetch actual sales revenue for these SKUs (more accurate than attributed)
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('sku_id, quantity, sale_price, order_date, skus(id, sku_code, name, brands(name))')
      .gte('order_date', from)
      .lte('order_date', to);

    const ordersBySku = {};
    for (const o of (orders || [])) {
      const id = o.sku_id;
      if (!id) continue;
      if (!ordersBySku[id]) ordersBySku[id] = { sku_code: o.skus?.sku_code ?? '—', sku_name: o.skus?.name ?? '—', brand: o.skus?.brands?.name ?? '—', units: 0, revenue: 0, orders: [] };
      ordersBySku[id].units   += o.quantity || 0;
      ordersBySku[id].revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
      ordersBySku[id].orders.push(o);
    }

    // ── Signal 2: Depletion ───────────────────────────────────────────────
    // 30-day baseline: go 30 days before `from`
    const dtFrom     = new Date(from);
    const baseline30Start = new Date(dtFrom); baseline30Start.setDate(baseline30Start.getDate() - 30);
    const baseline30End   = new Date(dtFrom); baseline30End.setDate(baseline30End.getDate() - 1);
    const b30From = baseline30Start.toISOString().slice(0, 10);
    const b30To   = baseline30End.toISOString().slice(0, 10);

    // 7-day window: last 7 days within `to`
    const dtTo       = new Date(to);
    const recent7Start = new Date(dtTo); recent7Start.setDate(recent7Start.getDate() - 6);
    const r7From = recent7Start.toISOString().slice(0, 10);
    const r7To   = to;

    const [{ data: baselineOrders }, { data: recentOrders }] = await Promise.all([
      supabase.from('sales_orders').select('sku_id, quantity').gte('order_date', b30From).lte('order_date', b30To),
      supabase.from('sales_orders').select('sku_id, quantity').gte('order_date', r7From).lte('order_date', r7To),
    ]);

    const baselineBySku = {};
    for (const o of (baselineOrders || [])) {
      if (!baselineBySku[o.sku_id]) baselineBySku[o.sku_id] = 0;
      baselineBySku[o.sku_id] += o.quantity || 0;
    }
    const recentBySku = {};
    for (const o of (recentOrders || [])) {
      if (!recentBySku[o.sku_id]) recentBySku[o.sku_id] = 0;
      recentBySku[o.sku_id] += o.quantity || 0;
    }

    // ── Build report ─────────────────────────────────────────────────────
    const allSkuIds = new Set([
      ...Object.keys(adBySku),
      ...Object.keys(ordersBySku),
    ]);

    const highBurn = [];
    for (const skuId of allSkuIds) {
      const ad      = adBySku[skuId]     || { ad_spend: 0, revenue_attributed: 0 };
      const ord     = ordersBySku[skuId] || { sku_code: '—', sku_name: '—', brand: '—', units: 0, revenue: 0 };

      const revenue  = ord.revenue;
      const adSpend  = ad.ad_spend;
      const acos     = revenue > 0 ? round2((adSpend / revenue) * 100) : null;
      const roas     = adSpend > 0 ? round2(revenue / adSpend)         : null;

      // Depletion signal
      const baselineUnits = baselineBySku[skuId] || 0;
      const recentUnits   = recentBySku[skuId]   || 0;
      const baselineVel   = baselineUnits / 30;    // units/day over 30-day baseline
      const recentVel     = recentUnits   / 7;     // units/day over last 7 days
      const depletionRatio = baselineVel > 0 ? round2(recentVel / baselineVel) : null;

      const flagAcos      = acos !== null && acos > acosThresh;
      const flagDepletion = depletionRatio !== null && depletionRatio > deplRatio;

      if (!flagAcos && !flagDepletion) continue; // not burning — skip

      highBurn.push({
        sku_id:       skuId,
        sku_code:     ord.sku_code,
        sku_name:     ord.sku_name,
        brand:        ord.brand,
        revenue:      round2(revenue),
        ad_spend:     round2(adSpend),
        acos,
        roas,
        flag_acos:      flagAcos,
        flag_depletion: flagDepletion,
        baseline_vel:   round2(baselineVel),
        recent_vel:     round2(recentVel),
        depletion_ratio: depletionRatio,
        total_units:    ord.units,
      });
    }

    highBurn.sort((a, b) => {
      // Sort: both flags first, then ACoS-only, then depletion-only
      const aScore = (a.flag_acos ? 2 : 0) + (a.flag_depletion ? 1 : 0);
      const bScore = (b.flag_acos ? 2 : 0) + (b.flag_depletion ? 1 : 0);
      return bScore - aScore || (b.acos ?? 0) - (a.acos ?? 0);
    });

    res.json({
      data: highBurn,
      thresholds: { acos_threshold: acosThresh, depletion_ratio: deplRatio },
      counts: {
        total:     highBurn.length,
        acos_only: highBurn.filter(s => s.flag_acos && !s.flag_depletion).length,
        depletion_only: highBurn.filter(s => !s.flag_acos && s.flag_depletion).length,
        both:      highBurn.filter(s => s.flag_acos && s.flag_depletion).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
