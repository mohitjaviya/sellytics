# Sellytics — Multi-Platform E-Commerce Analytics & Sales Intelligence

Sellytics is a comprehensive, enterprise-grade e-commerce analytics and management platform designed for multi-channel online brands. It aggregates inventory, sales orders, ad spend, sales targets, and profitability metrics across marketplaces like Amazon, Flipkart, Myntra, and direct-to-consumer websites.

---

## Key Features by Phase

### Phase 1 — Past Data Import
* **CSV & Excel Upload UI:** Easily upload historical SKUs, sales orders, inventory, and advertising spend.
* **Auto-Schema Mapper:** Native support for standard schemas as well as marketplace export sheets (e.g. Flipkart Order Sheets).
* **Validation & Preview Screen:** Pre-insertion check highlighting missing SKU codes, invalid dates, and malformed rows.

### Phase 2 — SKU & Catalog Management
* **SKU Quick-Add Form:** Create and map SKUs across platforms with category, cost price, and MRP tracking.
* **Launch Checklist:** Track SKU readiness per marketplace (images, title optimization, pricing, live status) with completion percentage.
* **Title & Image Change Log:** Automated history timeline tracking all catalog modifications.

### Phase 3 — Inventory & Warehouse Management
* **Multi-Warehouse Support:** Track real-time stock distribution across regional hubs (e.g., Mumbai, Delhi, Bangalore).
* **Low Stock Alerts:** Settable thresholds with visual notifications and dashboard badges.
* **Stock Aging Pie Chart:** Visual breakdown of stock by age buckets (`0-30`, `30-60`, `60-90`, `90+` days).

### Phase 4 — Sale Planning & Targets
* **Granular Target Setting:** Establish targets by SKU, City, or Seller Account.
* **Target vs Actuals Visualization:** Compare projected targets against actual sales over custom date ranges.

### Phase 5 — Core Sales Analytics
* **Fast & Slow-Movers:** Identify top-velocity items and dead stock with zero sales.
* **Brand & Platform Aggregation:** Interactive share-of-revenue breakdowns across brands and marketplaces.
* **Date Range Comparison Tool:** Side-by-side performance comparison of any two custom date windows.

### Phase 6 — Profitability & Ad Spend (ROAS)
* **Per-SKU Profit Calculator:** Real profit calculation: `Sale Price - Cost Price - Platform Commission - Shipping - Allocated Ad Spend`.
* **Ad Spend & ROAS Tracker:** Track Return on Ad Spend per platform and SKU.
* **High-Burning SKU Alerts:** Flag SKUs exceeding target ACoS or experiencing rapid stock burn.

### Phase 7 — Price A/B Testing
* **Price Experimentation:** Run A/B price variant tests on any SKU over custom date ranges.
* **Automated Attribution:** Sales orders are automatically attributed to variant A or B based on order pricing proximity.
* **Winner Determination:** Comparative metrics (units sold, revenue, conversion rate).

### Phase 8 — Role-Based Access Control (RBAC), Overview & Polish
* **Role Restrictions:** Enforce strict access rules for Sales Executives (restricted to assigned cities and seller accounts).
* **Executive Dashboard:** Live Overview with MTD top-line stats, target progress, top SKUs, and alert centers.
* **CSV & Print/PDF Export:** Export any table or chart view seamlessly.

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, Recharts.
* **Backend:** Node.js, Express.
* **Database & Auth:** Supabase (PostgreSQL), Supabase Auth.
* **Data Processing:** `xlsx`, `papaparse`.

---

## ⚡ Quick Start

### 1. Database Setup
Execute `schema.sql`, `phase7_migration.sql`, and `phase8_migration.sql` in your Supabase SQL Editor to initialize all tables, indices, and RLS policies.

### 2. Backend Setup
```bash
cd backend
npm install
```
Configure `.env` in `backend/`:
```env
PORT=4000
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
```

Run seed script (optional):
```bash
node seed.js
```

Start dev server:
```bash
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```
Configure `.env` in `frontend/`:
```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-supabase-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Start Vite dev server:
```bash
npm run dev
```

---

## 📄 License
ISC License
