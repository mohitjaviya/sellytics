const express = require('express');
const router  = express.Router();
const supabase = require('../lib/supabase');

// Helper for days between dates
function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1);
}

// ── GET /api/dashboard ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Rolling 30-day window. Format dates in LOCAL time — toISOString() would
    // shift the day backwards in positive-UTC-offset zones (e.g. IST is UTC+5:30).
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const windowTo   = ymd(new Date());
    const windowFrom = ymd((() => { const d = new Date(); d.setDate(d.getDate() - 29); return d; })());

    // Build queries
    let ordersQ = supabase
      .from('sales_orders')
      .select('quantity, sale_price, order_date, sku_id, skus(name, cost_price, image_url)')
      .gte('order_date', windowFrom)
      .lte('order_date', windowTo);
    ordersQ = applyRbac(ordersQ, req.user, 'sales_orders');

    const activeSkusQ = supabase
      .from('skus')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const invRowsQ = supabase
      .from('inventory')
      .select('quantity, skus(low_stock_threshold)');

    let targetQ = supabase
      .from('targets')
      .select('target_revenue, target_units')
      .lte('period_start', windowTo)
      .gte('period_end', windowFrom);
    targetQ = applyRbac(targetQ, req.user, 'targets');

    const priceTestsQ = supabase
      .from('price_tests')
      .select('id, name, skus(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3);

    // Execute all 5 queries concurrently
    const [
      { data: orders, error: oErr },
      { count: activeSkus },
      { data: invRows },
      { data: targets },
      { data: priceTests }
    ] = await Promise.all([ordersQ, activeSkusQ, invRowsQ, targetQ, priceTestsQ]);

    if (oErr) throw new Error(oErr.message);

    let mtdRevenue = 0;
    let mtdUnits = 0;
    let mtdGrossProfit = 0;
    const bySku = {};

    for (const o of (orders || [])) {
      const rev = (o.quantity || 0) * (parseFloat(o.sale_price) || 0);
      const cost = (o.quantity || 0) * (parseFloat(o.skus?.cost_price) || 0);
      mtdRevenue += rev;
      mtdUnits += (o.quantity || 0);
      mtdGrossProfit += (rev - cost);

      const sId = o.sku_id;
      if (sId) {
        if (!bySku[sId]) bySku[sId] = { id: sId, name: o.skus?.name, image: o.skus?.image_url, units: 0, revenue: 0 };
        bySku[sId].units += (o.quantity || 0);
        bySku[sId].revenue += rev;
      }
    }

    const daysSoFar = daysBetween(windowFrom, windowTo);
    const topSkus = Object.values(bySku)
      .map(s => ({ ...s, velocity: Math.round((s.units / daysSoFar) * 10) / 10 }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 5);

    const lowStockCount = (invRows || []).filter(
      r => (r.quantity ?? 0) < (r.skus?.low_stock_threshold ?? 10)
    ).length;

    let mtdTargetRevenue = 0;
    for (const t of (targets || [])) {
      mtdTargetRevenue += parseFloat(t.target_revenue) || 0;
    }

    res.json({
      metrics: {
        mtdRevenue,
        mtdGrossProfit,
        mtdUnits,
        activeSkus: activeSkus || 0,
        lowStockCount: lowStockCount || 0,
        mtdTargetRevenue
      },
      topSkus,
      activeTests: priceTests || []
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
