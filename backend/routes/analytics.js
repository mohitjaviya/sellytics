const express = require('express');
const router  = express.Router();
const supabase = require('../lib/supabase');
const { applyRbac } = require('../middleware/rbacHelper');

// ── Shared helper: fetch orders in a date range with sku + platform info ──────
async function fetchOrders(from, to, reqUser) {
  let query = supabase
    .from('sales_orders')
    .select(`
      sku_id, platform_id, account_id, quantity, sale_price, order_date,
      skus(id, sku_code, name, brand_id, brands(id, name)),
      platforms(id, name)
    `)
    .gte('order_date', from)
    .lte('order_date', to);
    
  query = applyRbac(query, reqUser, 'sales_orders');
  
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1);
}

function fmtNum(n) { return Math.round(n * 100) / 100; }

// ── GET /api/analytics/velocity ───────────────────────────────────────────────
// Top N SKUs by sales velocity (units/day)
router.get('/velocity', async (req, res) => {
  const { from, to, limit = 10 } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const orders = await fetchOrders(from, to, req.user);
    const days   = daysBetween(from, to);

    // Aggregate by SKU
    const bySkuId = {};
    for (const o of orders) {
      const id = o.sku_id;
      if (!id) continue;
      if (!bySkuId[id]) bySkuId[id] = {
        sku_id: id,
        sku_code:  o.skus?.sku_code ?? '—',
        sku_name:  o.skus?.name     ?? '—',
        brand:     o.skus?.brands?.name ?? '—',
        units: 0, revenue: 0, orders: 0,
      };
      bySkuId[id].units   += o.quantity || 0;
      bySkuId[id].revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
      bySkuId[id].orders  += 1;
    }

    const result = Object.values(bySkuId)
      .map(s => ({ ...s, velocity: fmtNum(s.units / days), revenue: Math.round(s.revenue), days }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, parseInt(limit));

    res.json({ data: result, days, from, to });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/slow-movers ───────────────────────────────────────────
// Bottom N SKUs by units sold (or zero sales) in period
router.get('/slow-movers', async (req, res) => {
  const { from, to, limit = 15, zero_only = 'false' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const days   = daysBetween(from, to);
    const [orders, { data: allSkus }] = await Promise.all([
      fetchOrders(from, to, req.user),
      supabase.from('skus').select('id, sku_code, name, brands(name)').eq('is_active', true),
    ]);

    // Build unit map from orders
    const unitMap = {};
    for (const o of orders) {
      if (!o.sku_id) continue;
      if (!unitMap[o.sku_id]) unitMap[o.sku_id] = {
        sku_id: o.sku_id,
        sku_code: o.skus?.sku_code ?? '—',
        sku_name: o.skus?.name     ?? '—',
        brand:    o.skus?.brands?.name ?? '—',
        units: 0, revenue: 0, orders: 0,
      };
      unitMap[o.sku_id].units   += o.quantity || 0;
      unitMap[o.sku_id].revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
      unitMap[o.sku_id].orders  += 1;
    }

    const zeroSellers = (allSkus || [])
      .filter(s => !unitMap[s.id])
      .map(s => ({
        sku_id: s.id, sku_code: s.sku_code, sku_name: s.name,
        brand: s.brands?.name ?? '—',
        units: 0, revenue: 0, orders: 0, velocity: 0, days,
      }));

    // Combine and sort ascending
    const poorPerformers = Object.values(unitMap)
      .map(s => ({ ...s, velocity: fmtNum(s.units / days), revenue: Math.round(s.revenue), days }))
      .sort((a, b) => a.units - b.units);

    let result;
    if (zero_only === 'true') {
      result = zeroSellers.slice(0, parseInt(limit));
    } else {
      result = [...zeroSellers, ...poorPerformers].slice(0, parseInt(limit));
    }

    res.json({ data: result, zero_count: zeroSellers.length, days, from, to });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/brand-sales ───────────────────────────────────────────
router.get('/brand-sales', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const orders = await fetchOrders(from, to, req.user);

    const byBrand = {};
    let totalRevenue = 0;
    for (const o of orders) {
      const brandId   = o.skus?.brand_id ?? '__no_brand__';
      const brandName = o.skus?.brands?.name ?? 'No Brand';
      if (!byBrand[brandId]) byBrand[brandId] = { brand_id: brandId, brand_name: brandName, units: 0, revenue: 0, orders: 0, skus: new Set() };
      const rev = (o.quantity || 0) * parseFloat(o.sale_price || 0);
      byBrand[brandId].units   += o.quantity || 0;
      byBrand[brandId].revenue += rev;
      byBrand[brandId].orders  += 1;
      byBrand[brandId].skus.add(o.sku_id);
      totalRevenue += rev;
    }

    const result = Object.values(byBrand)
      .map(b => ({
        brand_id:   b.brand_id,
        brand_name: b.brand_name,
        units:      b.units,
        revenue:    Math.round(b.revenue),
        orders:     b.orders,
        sku_count:  b.skus.size,
        share_pct:  totalRevenue > 0 ? fmtNum((b.revenue / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({ data: result, total_revenue: Math.round(totalRevenue) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/platform-comparison ────────────────────────────────────
router.get('/platform-comparison', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const orders = await fetchOrders(from, to, req.user);

    const byPlatform = {};
    let totalRevenue = 0;
    for (const o of orders) {
      const pid  = o.platform_id ?? '__unknown__';
      const name = o.platforms?.name ?? 'Unknown';
      if (!byPlatform[pid]) byPlatform[pid] = { platform_id: pid, platform_name: name, units: 0, revenue: 0, orders: 0, skus: new Set() };
      const rev = (o.quantity || 0) * parseFloat(o.sale_price || 0);
      byPlatform[pid].units   += o.quantity || 0;
      byPlatform[pid].revenue += rev;
      byPlatform[pid].orders  += 1;
      byPlatform[pid].skus.add(o.sku_id);
      totalRevenue += rev;
    }

    const result = Object.values(byPlatform)
      .map(p => ({
        platform_id:   p.platform_id,
        platform_name: p.platform_name,
        units:         p.units,
        revenue:       Math.round(p.revenue),
        orders:        p.orders,
        sku_count:     p.skus.size,
        share_pct:     totalRevenue > 0 ? fmtNum((p.revenue / totalRevenue) * 100) : 0,
        avg_order_value: p.orders > 0 ? Math.round(p.revenue / p.orders) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({ data: result, total_revenue: Math.round(totalRevenue) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/date-comparison ───────────────────────────────────────
// Compare two arbitrary date ranges side by side
router.get('/date-comparison', async (req, res) => {
  const { from_a, to_a, from_b, to_b } = req.query;
  if (!from_a || !to_a || !from_b || !to_b)
    return res.status(400).json({ error: 'from_a, to_a, from_b, to_b all required' });

  try {
    const [ordersA, ordersB] = await Promise.all([
      fetchOrders(from_a, to_a, req.user),
      fetchOrders(from_b, to_b, req.user),
    ]);

    function summarise(orders, from, to) {
      let revenue = 0, units = 0, skus = new Set(), platforms = new Set();
      for (const o of orders) {
        revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
        units   += o.quantity || 0;
        if (o.sku_id)      skus.add(o.sku_id);
        if (o.platform_id) platforms.add(o.platform_id);
      }
      return {
        from, to,
        days:          daysBetween(from, to),
        revenue:       Math.round(revenue),
        units,
        orders:        orders.length,
        unique_skus:   skus.size,
        unique_platforms: platforms.size,
        avg_order_value: orders.length > 0 ? Math.round(revenue / orders.length) : 0,
        revenue_per_day: Math.round(revenue / daysBetween(from, to)),
        units_per_day:   fmtNum(units / daysBetween(from, to)),
      };
    }

    const range_a = summarise(ordersA, from_a, to_a);
    const range_b = summarise(ordersB, from_b, to_b);

    // Delta % (A vs B, A is "current", B is "previous")
    function delta(a, b) {
      if (!b) return null;
      return fmtNum(((a - b) / b) * 100);
    }

    const deltas = {
      revenue:         delta(range_a.revenue,         range_b.revenue),
      units:           delta(range_a.units,            range_b.units),
      orders:          delta(range_a.orders,           range_b.orders),
      avg_order_value: delta(range_a.avg_order_value,  range_b.avg_order_value),
      revenue_per_day: delta(range_a.revenue_per_day,  range_b.revenue_per_day),
    };

    // Daily breakdown for both ranges (truncated to min length for overlay)
    function dailyBreakdown(orders) {
      const map = {};
      for (const o of orders) {
        const d = o.order_date;
        if (!map[d]) map[d] = { revenue: 0, units: 0, orders: 0 };
        map[d].revenue += (o.quantity || 0) * parseFloat(o.sale_price || 0);
        map[d].units   += o.quantity || 0;
        map[d].orders  += 1;
      }
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v, revenue: Math.round(v.revenue) }));
    }

    res.json({
      range_a,
      range_b,
      deltas,
      daily_a: dailyBreakdown(ordersA),
      daily_b: dailyBreakdown(ordersB),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
