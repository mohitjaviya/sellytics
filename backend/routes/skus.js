const express = require('express');
const router  = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Default launch checklist items applied to every new SKU
const DEFAULT_CHECKLIST = [
  'Product images uploaded (min 5)',
  'Title optimized with keywords',
  'Bullet points / description written',
  'Cost price & MRP set',
  'Listed on Amazon',
  'Listed on Flipkart',
  'Listed on Meesho',
  'Pricing competitive vs. market',
];

// ── GET /api/skus ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { search, brand_id, category, is_active } = req.query;

  let query = supabase
    .from('skus')
    .select(`
      *,
      brands(id, name),
      platform_sku_mapping(id, platform_id, platform_listing_id, current_price, platforms(name))
    `)
    .order('created_at', { ascending: false });

  if (search)    query = query.or(`sku_code.ilike.%${search}%,name.ilike.%${search}%`);
  if (brand_id)  query = query.eq('brand_id', brand_id);
  if (category)  query = query.eq('category', category);
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/skus/meta ─────────────────────────────────────────────────────────
// Returns distinct categories and brands for filter dropdowns
router.get('/meta', async (req, res) => {
  const [{ data: brands }, { data: cats }] = await Promise.all([
    supabase.from('brands').select('id,name').order('name'),
    supabase.from('skus').select('category').not('category', 'is', null),
  ]);
  const categories = [...new Set((cats || []).map(r => r.category).filter(Boolean))].sort();
  res.json({ brands: brands || [], categories });
});

// ── GET /api/skus/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('skus')
    .select(`
      *,
      brands(id, name),
      platform_sku_mapping(id, platform_id, platform_listing_id, current_price, is_active, platforms(name))
    `)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// ── POST /api/skus ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    sku_code, name, brand_name, brand_id, category,
    cost_price, mrp, image_url, platform_mappings = [],
  } = req.body;

  if (!sku_code || !name)
    return res.status(400).json({ error: 'sku_code and name are required' });

  // Resolve or create brand
  let resolvedBrandId = brand_id ?? null;
  if (!resolvedBrandId && brand_name) {
    const { data: b } = await supabase
      .from('brands')
      .upsert({ name: brand_name.trim() }, { onConflict: 'name' })
      .select('id')
      .single();
    if (b) resolvedBrandId = b.id;
  }

  // Insert SKU
  const { data: sku, error } = await supabase
    .from('skus')
    .insert({
      sku_code: sku_code.trim().toUpperCase(),
      name: name.trim(),
      brand_id: resolvedBrandId,
      category: category?.trim() || null,
      cost_price: parseFloat(cost_price) || 0,
      mrp: parseFloat(mrp) || 0,
      image_url: image_url || null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Insert default checklist
  const checklistRows = DEFAULT_CHECKLIST.map(item => ({
    sku_id: sku.id,
    checklist_item: item,
    is_complete: false,
  }));
  await supabase.from('sku_checklist').insert(checklistRows);

  // Insert platform mappings
  if (platform_mappings.length > 0) {
    const mappings = platform_mappings
      .filter(m => m.platform_id)
      .map(m => ({
        sku_id: sku.id,
        platform_id: m.platform_id,
        platform_listing_id: m.platform_listing_id || null,
        current_price: m.current_price ? parseFloat(m.current_price) : null,
      }));
    if (mappings.length) {
      await supabase.from('platform_sku_mapping').insert(mappings);
    }
  }

  res.status(201).json(sku);
});

// ── PUT /api/skus/:id ─────────────────────────────────────────────────────────
// Records change log for title (name) and image_url changes
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, image_url, changed_by, ...rest } = req.body;

  // Fetch current values to diff
  const { data: current } = await supabase
    .from('skus')
    .select('name, image_url')
    .eq('id', id)
    .single();

  // Resolve brand if brand_name supplied
  let brand_id = rest.brand_id;
  if (!brand_id && rest.brand_name) {
    const { data: b } = await supabase
      .from('brands')
      .upsert({ name: rest.brand_name.trim() }, { onConflict: 'name' })
      .select('id')
      .single();
    if (b) brand_id = b.id;
    delete rest.brand_name;
  }

  const updatePayload = { ...rest, brand_id };
  if (name !== undefined)      updatePayload.name      = name.trim();
  if (image_url !== undefined) updatePayload.image_url = image_url;

  const { data: updated, error } = await supabase
    .from('skus')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Record change log entries
  const logs = [];
  if (current && name !== undefined && name.trim() !== current.name) {
    logs.push({
      sku_id: id,
      field_changed: 'name',
      old_value: current.name,
      new_value: name.trim(),
      changed_by: changed_by || null,
    });
  }
  if (current && image_url !== undefined && image_url !== current.image_url) {
    logs.push({
      sku_id: id,
      field_changed: 'image_url',
      old_value: current.image_url,
      new_value: image_url,
      changed_by: changed_by || null,
    });
  }
  if (logs.length) await supabase.from('title_image_history').insert(logs);

  res.json(updated);
});

// ── PATCH /api/skus/:id/archive ───────────────────────────────────────────────
router.patch('/:id/archive', async (req, res) => {
  const { data, error } = await supabase
    .from('skus')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/skus/:id/checklist ───────────────────────────────────────────────
router.get('/:id/checklist', async (req, res) => {
  const { data, error } = await supabase
    .from('sku_checklist')
    .select('*')
    .eq('sku_id', req.params.id)
    .order('updated_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/skus/:id/checklist ─────────────────────────────────────────────
router.post('/:id/checklist', async (req, res) => {
  const { checklist_item } = req.body;
  if (!checklist_item?.trim())
    return res.status(400).json({ error: 'checklist_item is required' });

  const { data, error } = await supabase
    .from('sku_checklist')
    .insert({ sku_id: req.params.id, checklist_item: checklist_item.trim(), is_complete: false })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ── PATCH /api/skus/:skuId/checklist/:itemId ──────────────────────────────────
router.patch('/:skuId/checklist/:itemId', async (req, res) => {
  const { is_complete } = req.body;
  const { data, error } = await supabase
    .from('sku_checklist')
    .update({ is_complete, updated_at: new Date().toISOString() })
    .eq('id', req.params.itemId)
    .eq('sku_id', req.params.skuId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/skus/:skuId/checklist/:itemId ─────────────────────────────────
router.delete('/:skuId/checklist/:itemId', async (req, res) => {
  const { error } = await supabase
    .from('sku_checklist')
    .delete()
    .eq('id', req.params.itemId)
    .eq('sku_id', req.params.skuId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── GET /api/skus/:id/history ─────────────────────────────────────────────────
router.get('/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('title_image_history')
    .select('*')
    .eq('sku_id', req.params.id)
    .order('changed_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/skus/:id/mappings ────────────────────────────────────────────────
// Upsert platform listing ID mappings
router.put('/:id/mappings', async (req, res) => {
  const { mappings } = req.body; // [{platform_id, platform_listing_id, current_price}]
  if (!Array.isArray(mappings))
    return res.status(400).json({ error: 'mappings must be an array' });

  const rows = mappings.map(m => ({
    sku_id: req.params.id,
    platform_id: m.platform_id,
    platform_listing_id: m.platform_listing_id || null,
    current_price: m.current_price ? parseFloat(m.current_price) : null,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('platform_sku_mapping')
    .upsert(rows, { onConflict: 'sku_id,platform_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/skus/image-upload-url ──────────────────────────────────────────
// Generate a signed upload URL for Supabase Storage
router.post('/image-upload-url', async (req, res) => {
  const { sku_code, file_name } = req.body;
  if (!sku_code || !file_name)
    return res.status(400).json({ error: 'sku_code and file_name required' });

  const path = `${sku_code}/${Date.now()}_${file_name}`;
  const { data, error } = await supabase.storage
    .from('sku-images')
    .createSignedUploadUrl(path);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, path });
});

module.exports = router;
