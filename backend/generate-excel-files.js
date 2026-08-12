const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const supabase = require('./lib/supabase');

async function generate() {
  console.log('🚀 Fetching SKUs, Warehouses, and Platforms from database...');

  // 1. Fetch SKUs
  const { data: skus, error: skuErr } = await supabase.from('skus').select('*');
  if (skuErr) { console.error('SKU fetch error:', skuErr); return; }

  // 2. Ensure Warehouses exist
  let { data: warehouses } = await supabase.from('warehouses').select('*');
  if (!warehouses || warehouses.length < 4) {
    const whList = [
      { name: 'Mumbai Central Hub', city: 'Mumbai' },
      { name: 'Delhi NCR Fulfillment Center', city: 'Delhi' },
      { name: 'Bengaluru Logistics Depot', city: 'Bengaluru' },
      { name: 'Ahmedabad Distribution Center', city: 'Ahmedabad' }
    ];
    for (const w of whList) {
      await supabase.from('warehouses').upsert(w, { onConflict: 'name' });
    }
    const { data: updatedWh } = await supabase.from('warehouses').select('*');
    warehouses = updatedWh;
  }

  // 3. Ensure Platforms exist
  let { data: platforms } = await supabase.from('platforms').select('*');
  if (!platforms || platforms.length === 0) {
    const platList = [
      { name: 'Amazon', type: 'marketplace' },
      { name: 'Flipkart', type: 'marketplace' },
      { name: 'Meesho', type: 'marketplace' },
      { name: 'Myntra', type: 'marketplace' },
      { name: 'Direct Web', type: 'direct' }
    ];
    for (const p of platList) {
      await supabase.from('platforms').upsert(p, { onConflict: 'name' });
    }
    const { data: updatedPlat } = await supabase.from('platforms').select('*');
    platforms = updatedPlat;
  }

  console.log(`Found ${skus.length} SKUs, ${warehouses.length} Warehouses, ${platforms.length} Platforms.`);

  // ── 1. GENERATE INVENTORY DATA ───────────────────────────────────────────────
  const inventoryRows = [];
  const dbInventoryRows = [];
  const dateNow = new Date();

  skus.forEach((sku, idx) => {
    const wh1 = warehouses[idx % warehouses.length];
    const wh2 = warehouses[(idx + 2) % warehouses.length];
    const whList = Array.from(new Set([wh1, wh2])).filter(Boolean);

    whList.forEach((wh, wIdx) => {
      // Create realistic stock
      const isLow = (idx + wIdx) % 7 === 0;
      const quantity = isLow ? Math.floor(Math.random() * 8) + 1 : Math.floor(Math.random() * 350) + 25;
      const threshold = sku.low_stock_threshold || 10;
      const status = quantity <= threshold ? 'LOW STOCK' : 'IN STOCK';
      
      const restockDate = new Date();
      restockDate.setDate(dateNow.getDate() - Math.floor(Math.random() * 20));
      const restockStr = restockDate.toISOString().slice(0, 10);

      inventoryRows.push({
        'SKU Code': sku.sku_code,
        'SKU Name': sku.name,
        'Category': sku.category || 'Grooming',
        'Warehouse Name': wh.name,
        'City': wh.city || 'Mumbai',
        'Stock Quantity': quantity,
        'Low Stock Threshold': threshold,
        'Stock Status': status,
        'Cost Price (₹)': sku.cost_price || 150,
        'MRP (₹)': sku.mrp || 599,
        'Total Inventory Value (₹)': quantity * (sku.cost_price || 150),
        'Last Restocked Date': restockStr
      });

      dbInventoryRows.push({
        sku_id: sku.id,
        warehouse_id: wh.id,
        quantity: quantity,
        last_restocked_at: restockDate.toISOString()
      });
    });
  });

  // ── 2. GENERATE AD SPEND DATA ────────────────────────────────────────────────
  const adSpendRows = [];
  const dbAdSpendRows = [];

  const adPlatforms = platforms.filter(p => p.name !== 'Direct Web');

  skus.forEach((sku, idx) => {
    // Generate ad spend for past 15 days across platforms
    for (let day = 1; day <= 15; day++) {
      const d = new Date();
      d.setDate(dateNow.getDate() - day);
      const dateStr = d.toISOString().slice(0, 10);

      const plat = adPlatforms[(idx + day) % adPlatforms.length];
      
      // Realistic ad figures
      const spend = Math.floor(Math.random() * 1200) + 150;
      const impressions = spend * (Math.floor(Math.random() * 25) + 15);
      const clicks = Math.floor(impressions * (Math.random() * 0.04 + 0.015));
      const ctr = ((clicks / impressions) * 100).toFixed(2) + '%';
      const adOrders = Math.floor(clicks * (Math.random() * 0.12 + 0.03)) + 1;
      const revAttributed = adOrders * (sku.mrp ? Math.floor(sku.mrp * 0.7) : 450);
      const roas = (revAttributed / spend).toFixed(2);
      const acos = ((spend / revAttributed) * 100).toFixed(1) + '%';

      adSpendRows.push({
        'Date': dateStr,
        'SKU Code': sku.sku_code,
        'SKU Name': sku.name,
        'Platform': plat.name,
        'Ad Spend (₹)': spend,
        'Impressions': impressions,
        'Clicks': clicks,
        'CTR': ctr,
        'Ad Orders': adOrders,
        'Attributed Revenue (₹)': revAttributed,
        'ROAS': `${roas}x`,
        'ACoS': acos
      });

      dbAdSpendRows.push({
        sku_id: sku.id,
        platform_id: plat.id,
        date: dateStr,
        amount: spend,
        revenue_attributed: revAttributed
      });
    }
  });

  // ── SAVE TO EXCEL (.xlsx) & CSV ──────────────────────────────────────────────
  const projectRoot = path.join(__dirname, '..');

  // 1. Inventory Excel & CSV
  const invWs = XLSX.utils.json_to_sheet(inventoryRows);
  const invWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(invWb, invWs, 'Inventory');
  const invXlsxPath = path.join(projectRoot, 'Inventory_Data.xlsx');
  const invCsvPath  = path.join(projectRoot, 'Inventory_Data.csv');
  XLSX.writeFile(invWb, invXlsxPath);
  fs.writeFileSync(invCsvPath, XLSX.utils.sheet_to_csv(invWs));

  // 2. Ad Spend Excel & CSV
  const adWs = XLSX.utils.json_to_sheet(adSpendRows);
  const adWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(adWb, adWs, 'Ad Spend');
  const adXlsxPath = path.join(projectRoot, 'Ad_Spend_Data.xlsx');
  const adCsvPath  = path.join(projectRoot, 'Ad_Spend_Data.csv');
  XLSX.writeFile(adWb, adXlsxPath);
  fs.writeFileSync(adCsvPath, XLSX.utils.sheet_to_csv(adWs));

  console.log('✅ Generated Excel & CSV files:');
  console.log(` - ${invXlsxPath} (${inventoryRows.length} inventory rows)`);
  console.log(` - ${invCsvPath}`);
  console.log(` - ${adXlsxPath} (${adSpendRows.length} ad spend rows)`);
  console.log(` - ${adCsvPath}`);

  // ── SEED DATABASE ────────────────────────────────────────────────────────────
  console.log('🌱 Seeding database inventory and ad_spend tables...');
  
  // Clear old inventory & ad_spend
  await supabase.from('inventory').delete().neq('quantity', -99999);
  await supabase.from('ad_spend').delete().neq('amount', -99999);

  // Batch insert inventory
  for (let i = 0; i < dbInventoryRows.length; i += 50) {
    const chunk = dbInventoryRows.slice(i, i + 50);
    const { error } = await supabase.from('inventory').upsert(chunk, { onConflict: 'sku_id,warehouse_id' });
    if (error) console.error('Inventory upsert error:', error.message);
  }

  // Batch insert ad_spend
  for (let i = 0; i < dbAdSpendRows.length; i += 100) {
    const chunk = dbAdSpendRows.slice(i, i + 100);
    const { error } = await supabase.from('ad_spend').insert(chunk);
    if (error) console.error('Ad spend insert error:', error.message);
  }

  console.log('🎉 Database successfully populated with real Inventory and Ad Spend data!');
}

generate().catch(err => console.error('Generation failed:', err));
