require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Supabase Client ─────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));
// Bulk CSV/Excel imports can post thousands of rows — the 100 KB default is far
// too small (e.g. a 231-row Meesho sheet is ~145 KB), so raise the JSON limit.
app.use(express.json({ limit: '25mb' }));

// ── Route imports ────────────────────────────────────────────────────────────
const importRoutes        = require('./routes/import');
const skuRoutes           = require('./routes/skus');
const inventoryRoutes     = require('./routes/inventory');
const salesRoutes         = require('./routes/sales');
const analyticsRoutes     = require('./routes/analytics');
const profitabilityRoutes = require('./routes/profitability');
const priceTestsRoutes    = require('./routes/priceTests');
const usersRoutes         = require('./routes/users');
const dashboardRoutes     = require('./routes/dashboard');
const integrationsRoutes  = require('./routes/integrations');

const authMiddleware      = require('./middleware/auth');

// ── Routes ───────────────────────────────────────────────────────────────────

// Protect all /api routes except /api/health
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  authMiddleware(req, res, next);
});

// Mount routes
app.use('/api/import',          importRoutes);
app.use('/api/skus',            skuRoutes);
app.use('/api/inventory',       inventoryRoutes);
app.use('/api/sales',           salesRoutes);
app.use('/api/targets',         salesRoutes);
app.use('/api/analytics',       analyticsRoutes);
app.use('/api/profitability',   profitabilityRoutes);
app.use('/api/price-tests',     priceTestsRoutes);
app.use('/api/users',           usersRoutes);
app.use('/api/dashboard',       dashboardRoutes);
app.use('/api/integrations',    integrationsRoutes);

// Alias: warehouses live on the inventory router at /api/inventory/warehouses
// Also expose them at /api/warehouses for convenience
app.use('/api/warehouses', (req, res, next) => {
  req.url = '/warehouses' + req.url.replace(/^\/?/, '/').replace('//', '/');
  inventoryRoutes(req, res, next);
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Ping Supabase with a lightweight query
    const { error } = await supabase.from('platforms').select('id').limit(1);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: error ? 'unreachable' : 'connected',
      version: '1.0.0',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Platforms
app.get('/api/platforms', async (req, res) => {
  const { data, error } = await supabase.from('platforms').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Brands
app.get('/api/brands', async (req, res) => {
  const { data, error } = await supabase.from('brands').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SKUs
app.get('/api/skus', async (req, res) => {
  const { data, error } = await supabase
    .from('skus')
    .select('*, brands(name)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Warehouses
app.get('/api/warehouses', async (req, res) => {
  const { data, error } = await supabase.from('warehouses').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Inventory
app.get('/api/inventory', async (req, res) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, skus(sku_code, name), warehouses(name, city)')
    .order('last_restocked_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Sales Orders
app.get('/api/sales-orders', async (req, res) => {
  const { from, to, platform_id } = req.query;
  let query = supabase
    .from('sales_orders')
    .select('*, skus(sku_code, name), platforms(name), warehouses(name)')
    .order('order_date', { ascending: false });

  if (from) query = query.gte('order_date', from);
  if (to) query = query.lte('order_date', to);
  if (platform_id) query = query.eq('platform_id', platform_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Targets
app.get('/api/targets', async (req, res) => {
  const { data, error } = await supabase
    .from('targets')
    .select('*, skus(sku_code, name)')
    .order('period_start', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Ad Spend
app.get('/api/ad-spend', async (req, res) => {
  const { data, error } = await supabase
    .from('ad_spend')
    .select('*, skus(sku_code, name), platforms(name)')
    .order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Sellytics API running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;

