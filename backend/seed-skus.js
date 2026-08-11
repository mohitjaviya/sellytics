require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function seedSkus() {
  console.log('📦 Extracting SKUs from order sheets...');
  const skus = new Map();

  try {
    const wb1 = XLSX.readFile('../flipkart order sheet.xlsx');
    const d1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
    d1.forEach(r => {
      if (r['SKU ID']) {
        const s = String(r['SKU ID']).trim();
        if (!skus.has(s)) skus.set(s, { 
          sku_code: s, 
          name: r['Vertical'] || 'Flipkart Product', 
          category: r['Category'] || 'General',
          cost_price: 150.00,
          mrp: 599.00
        });
      }
    });
  } catch(e) { console.log('Skipped Flipkart sheet:', e.message); }

  try {
    const wb2 = XLSX.readFile('../amazon order sheet.xlsx');
    const d2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);
    d2.forEach(r => {
      if (r.sku) {
        const s = String(r.sku).trim();
        if (!skus.has(s)) skus.set(s, { 
          sku_code: s, 
          name: r['product-name'] || 'Amazon Product', 
          category: 'General',
          cost_price: 150.00,
          mrp: 599.00
        });
      }
    });
  } catch(e) { console.log('Skipped Amazon sheet:', e.message); }

  try {
    const csv = fs.readFileSync('../meesho orders sheet.csv', 'utf8');
    const lines = csv.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if(!l) continue;
      const cols = l.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      if(cols && cols.length >= 8) {
         let sku = cols[7] ? cols[7].replace(/^"|"$/g, '').trim() : null;
         if(sku && !skus.has(sku)) {
             let name = cols[6] ? cols[6].replace(/^"|"$/g, '').trim() : 'Meesho Product';
             skus.set(sku, { 
               sku_code: sku, 
               name: name, 
               category: 'General',
               cost_price: 150.00,
               mrp: 599.00
             });
         }
      }
    }
  } catch(e) { console.log('Skipped Meesho sheet:', e.message); }

  const skuArray = [...skus.values()];
  console.log(`Found ${skuArray.length} unique SKUs.`);
  console.log('Uploading to Supabase database...');

  // Upsert to Supabase
  const { data, error } = await supabase.from('skus').upsert(skuArray, { onConflict: 'sku_code' });
  
  if (error) {
    console.error('❌ Error inserting SKUs:', error);
  } else {
    console.log(`✅ Successfully generated and inserted ${skuArray.length} SKUs into the database!`);
  }
}

seedSkus().catch(console.error);
