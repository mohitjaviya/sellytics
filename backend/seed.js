require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1) + min); }
function randEl(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  console.log('🌱 Starting Supabase Seed...');

  // 1. Fetch Platforms & Warehouses
  const { data: platforms } = await supabase.from('platforms').select('id, name');
  if (!platforms || platforms.length === 0) {
    console.error('No platforms found! Did you run schema.sql?');
    return;
  }
  
  // Insert Warehouses
  let { data: warehouses } = await supabase.from('warehouses').select('id, city');
  if (!warehouses || warehouses.length === 0) {
    const { data } = await supabase.from('warehouses').insert([
      { name: 'Mumbai Central Hub', city: 'Mumbai', address: 'Andheri East' },
      { name: 'Delhi NCR Depot', city: 'Delhi', address: 'Gurugram' },
      { name: 'Bangalore FC', city: 'Bangalore', address: 'Whitefield' }
    ]).select('id, city');
    warehouses = data;
  }

  // Insert Brands
  const { data: brands } = await supabase.from('brands').upsert([
    { name: 'Nike' }, { name: 'Puma' }, { name: 'Adidas' }, { name: 'Reebok' }
  ], { onConflict: 'name' }).select('id');

  // 2. Insert SKUs
  const skuPayload = [
    { sku_code: 'NK-RUN-01', name: 'Nike Air Zoom', brand_id: brands[0].id, category: 'Footwear', cost_price: 2500, mrp: 4999 },
    { sku_code: 'NK-TSH-02', name: 'Nike Dri-FIT Tee', brand_id: brands[0].id, category: 'Apparel', cost_price: 800, mrp: 1999 },
    { sku_code: 'PU-SNE-01', name: 'Puma RS-X', brand_id: brands[1].id, category: 'Footwear', cost_price: 3200, mrp: 6999 },
    { sku_code: 'AD-ULT-01', name: 'Adidas Ultraboost', brand_id: brands[2].id, category: 'Footwear', cost_price: 4500, mrp: 8999 },
    { sku_code: 'RB-TRA-01', name: 'Reebok Nano X2', brand_id: brands[3].id, category: 'Footwear', cost_price: 3800, mrp: 7599 },
    { sku_code: 'AD-JOG-02', name: 'Adidas Joggers', brand_id: brands[2].id, category: 'Apparel', cost_price: 1200, mrp: 2999 },
  ];
  const { data: skus } = await supabase.from('skus').upsert(skuPayload, { onConflict: 'sku_code' }).select('id, cost_price, mrp');
  console.log(`✅ Seeded ${skus.length} SKUs`);

  // 3. Accounts
  const { data: accounts } = await supabase.from('accounts').upsert([
    { platform_id: platforms.find(p => p.name === 'Amazon').id, account_name: 'Alpha Sellers' },
    { platform_id: platforms.find(p => p.name === 'Flipkart').id, account_name: 'RetailNet' },
    { platform_id: platforms.find(p => p.name === 'Myntra').id, account_name: 'Fashion Retail' },
    { platform_id: platforms.find(p => p.name === 'Own Website').id, account_name: 'D2C Store' }
  ], { onConflict: 'id' }).select('id, platform_id, account_name');

  // 4. Inventory
  const invPayload = [];
  for (const s of skus) {
    for (const w of warehouses) {
      invPayload.push({
        sku_id: s.id,
        warehouse_id: w.id,
        quantity: rand(10, 500),
        last_restocked_at: new Date(Date.now() - rand(0, 90) * 86400000).toISOString()
      });
    }
  }
  await supabase.from('inventory').upsert(invPayload, { onConflict: 'sku_id,warehouse_id' });
  console.log(`✅ Seeded Inventory`);

  // 5. Sales Orders (last 90 days)
  const orders = [];
  const now = new Date();
  const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Hyderabad'];
  
  for (let i = 0; i < 600; i++) {
    const s = randEl(skus);
    const w = randEl(warehouses);
    const a = randEl(accounts);
    
    // Random date in last 90 days
    const d = new Date(now.getTime() - rand(0, 90) * 86400000);
    
    // Sale price fluctuates around MRP
    const salePrice = s.cost_price + ((s.mrp - s.cost_price) * rand(40, 90) / 100);

    orders.push({
      sku_id: s.id,
      platform_id: a.platform_id,
      warehouse_id: w.id,
      account_id: a.id,
      city: randEl(CITIES),
      quantity: rand(1, 3),
      sale_price: salePrice.toFixed(2),
      order_date: d.toISOString().slice(0, 10)
    });
  }
  
  // Chunk insert orders
  for (let i = 0; i < orders.length; i += 200) {
    await supabase.from('sales_orders').insert(orders.slice(i, i + 200));
  }
  console.log(`✅ Seeded ${orders.length} Sales Orders`);

  // 6. Ad Spend (last 90 days)
  const adSpend = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const s of skus) {
      for (const p of platforms) {
        if (rand(0, 100) > 30) { // 70% chance of spending on a given day/platform
          adSpend.push({
            sku_id: s.id,
            platform_id: p.id,
            date: d,
            amount: rand(100, 2000)
          });
        }
      }
    }
  }
  for (let i = 0; i < adSpend.length; i += 500) {
    await supabase.from('ad_spend').insert(adSpend.slice(i, i + 500));
  }
  console.log(`✅ Seeded Ad Spend`);

  // 7. Targets (current month and next month)
  const targets = [];
  const currMonth = now.toISOString().slice(0, 7) + '-01';
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 7) + '-01';
  const currMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

  for (const s of skus) {
    targets.push(
      { sku_id: s.id, period_start: currMonth, period_end: currMonthEnd, target_units: rand(50, 300), target_revenue: rand(100000, 500000) },
      { sku_id: s.id, period_start: nextMonth, period_end: nextMonthEnd, target_units: rand(60, 350), target_revenue: rand(120000, 600000) }
    );
  }
  await supabase.from('targets').insert(targets);
  console.log(`✅ Seeded Targets`);

  console.log('🎉 Seed Complete! Data is ready for testing.');
}

seed().catch(console.error);
