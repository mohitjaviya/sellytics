-- ============================================================
--  SELLYTICS — Complete Phase 0 Database Schema
--  Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── 1. platforms ────────────────────────────────────────────
create table if not exists platforms (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  type        text not null check (type in ('marketplace','owned')),
  created_at  timestamptz default now()
);

-- Seed default platforms
insert into platforms (name, type) values
  ('Amazon',   'marketplace'),
  ('Flipkart',  'marketplace'),
  ('Meesho',    'marketplace'),
  ('Myntra',    'marketplace'),
  ('Own Website','owned')
on conflict (name) do nothing;

-- ── 2. brands ────────────────────────────────────────────────
create table if not exists brands (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  created_at  timestamptz default now()
);

-- ── 3. skus ──────────────────────────────────────────────────
create table if not exists skus (
  id           uuid primary key default uuid_generate_v4(),
  sku_code     text not null unique,
  name         text not null,
  brand_id     uuid references brands(id) on delete set null,
  category     text,
  cost_price   numeric(12,2) not null default 0,
  mrp          numeric(12,2) not null default 0,
  image_url    text,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

-- ── 4. accounts ──────────────────────────────────────────────
create table if not exists accounts (
  id            uuid primary key default uuid_generate_v4(),
  platform_id   uuid references platforms(id) on delete cascade,
  account_name  text not null,
  created_at    timestamptz default now()
);

-- ── 5. platform_sku_mapping ──────────────────────────────────
create table if not exists platform_sku_mapping (
  id                  uuid primary key default uuid_generate_v4(),
  sku_id              uuid references skus(id) on delete cascade,
  platform_id         uuid references platforms(id) on delete cascade,
  platform_listing_id text,
  current_price       numeric(12,2),
  is_active           boolean default true,
  created_at          timestamptz default now(),
  unique(sku_id, platform_id)
);

-- ── 6. warehouses ────────────────────────────────────────────
create table if not exists warehouses (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  city        text not null,
  address     text,
  created_at  timestamptz default now()
);

-- ── 7. inventory ─────────────────────────────────────────────
create table if not exists inventory (
  id                uuid primary key default uuid_generate_v4(),
  sku_id            uuid references skus(id) on delete cascade,
  warehouse_id      uuid references warehouses(id) on delete cascade,
  quantity          integer not null default 0,
  last_restocked_at timestamptz default now(),
  updated_at        timestamptz default now(),
  unique(sku_id, warehouse_id)
);

-- ── 8. sales_orders ──────────────────────────────────────────
create table if not exists sales_orders (
  id           uuid primary key default uuid_generate_v4(),
  sku_id       uuid references skus(id) on delete set null,
  platform_id  uuid references platforms(id) on delete set null,
  warehouse_id uuid references warehouses(id) on delete set null,
  account_id   uuid references accounts(id) on delete set null,
  city         text,
  quantity     integer not null default 1,
  sale_price   numeric(12,2) not null,
  order_date   date not null default current_date,
  created_at   timestamptz default now()
);

-- ── 9. targets ───────────────────────────────────────────────
create table if not exists targets (
  id              uuid primary key default uuid_generate_v4(),
  sku_id          uuid references skus(id) on delete cascade,
  account_id      uuid references accounts(id) on delete set null,
  city            text,
  period_start    date not null,
  period_end      date not null,
  target_revenue  numeric(14,2) not null default 0,
  target_units    integer not null default 0,
  created_at      timestamptz default now()
);

-- ── 10. ad_spend ─────────────────────────────────────────────
create table if not exists ad_spend (
  id                 uuid primary key default uuid_generate_v4(),
  sku_id             uuid references skus(id) on delete cascade,
  platform_id        uuid references platforms(id) on delete cascade,
  date               date not null,
  amount             numeric(12,2) not null default 0,
  revenue_attributed numeric(12,2) default 0,
  created_at         timestamptz default now()
);

-- ── 11. sku_checklist ────────────────────────────────────────
create table if not exists sku_checklist (
  id             uuid primary key default uuid_generate_v4(),
  sku_id         uuid references skus(id) on delete cascade,
  checklist_item text not null,
  is_complete    boolean default false,
  updated_at     timestamptz default now()
);

-- ── 12. title_image_history ──────────────────────────────────
create table if not exists title_image_history (
  id            uuid primary key default uuid_generate_v4(),
  sku_id        uuid references skus(id) on delete cascade,
  field_changed text not null,
  old_value     text,
  new_value     text,
  changed_by    uuid references auth.users(id) on delete set null,
  changed_at    timestamptz default now()
);

-- ── 13. price_ab_tests ───────────────────────────────────────
create table if not exists price_ab_tests (
  id               uuid primary key default uuid_generate_v4(),
  sku_id           uuid references skus(id) on delete cascade,
  variant_a_price  numeric(12,2) not null,
  variant_b_price  numeric(12,2) not null,
  start_date       date not null,
  end_date         date,
  variant_a_sales  integer default 0,
  variant_b_sales  integer default 0,
  status           text default 'active' check (status in ('active','completed','paused')),
  created_at       timestamptz default now()
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

alter table platforms          enable row level security;
alter table brands             enable row level security;
alter table skus               enable row level security;
alter table accounts           enable row level security;
alter table platform_sku_mapping enable row level security;
alter table warehouses         enable row level security;
alter table inventory          enable row level security;
alter table sales_orders       enable row level security;
alter table targets            enable row level security;
alter table ad_spend           enable row level security;
alter table sku_checklist      enable row level security;
alter table title_image_history enable row level security;
alter table price_ab_tests     enable row level security;

-- Allow authenticated users full read access
create policy "Auth users can read platforms"           on platforms           for select using (auth.role() = 'authenticated');
create policy "Auth users can read brands"              on brands              for select using (auth.role() = 'authenticated');
create policy "Auth users can read skus"                on skus                for select using (auth.role() = 'authenticated');
create policy "Auth users can read accounts"            on accounts            for select using (auth.role() = 'authenticated');
create policy "Auth users can read platform_sku_mapping" on platform_sku_mapping for select using (auth.role() = 'authenticated');
create policy "Auth users can read warehouses"          on warehouses          for select using (auth.role() = 'authenticated');
create policy "Auth users can read inventory"           on inventory           for select using (auth.role() = 'authenticated');
create policy "Auth users can read sales_orders"        on sales_orders        for select using (auth.role() = 'authenticated');
create policy "Auth users can read targets"             on targets             for select using (auth.role() = 'authenticated');
create policy "Auth users can read ad_spend"            on ad_spend            for select using (auth.role() = 'authenticated');
create policy "Auth users can read sku_checklist"       on sku_checklist       for select using (auth.role() = 'authenticated');
create policy "Auth users can read title_image_history" on title_image_history for select using (auth.role() = 'authenticated');
create policy "Auth users can read price_ab_tests"      on price_ab_tests      for select using (auth.role() = 'authenticated');

-- Write policies — Admin and Manager only (role stored in user metadata)
create policy "Admin/Manager can write skus" on skus for all
  using  (auth.jwt()->>'role' in ('Admin','Manager'))
  with check (auth.jwt()->>'role' in ('Admin','Manager'));

create policy "Admin/Manager can write sales_orders" on sales_orders for all
  using  (auth.jwt()->>'role' in ('Admin','Manager','Sales Executive'))
  with check (auth.jwt()->>'role' in ('Admin','Manager','Sales Executive'));

create policy "Admin can write inventory" on inventory for all
  using  (auth.jwt()->>'role' in ('Admin','Manager'))
  with check (auth.jwt()->>'role' in ('Admin','Manager'));

-- ============================================================
--  USEFUL INDEXES
-- ============================================================
create index if not exists idx_skus_brand_id         on skus(brand_id);
create index if not exists idx_skus_category         on skus(category);
create index if not exists idx_inventory_sku         on inventory(sku_id);
create index if not exists idx_inventory_warehouse   on inventory(warehouse_id);
create index if not exists idx_sales_orders_sku      on sales_orders(sku_id);
create index if not exists idx_sales_orders_platform on sales_orders(platform_id);
create index if not exists idx_sales_orders_date     on sales_orders(order_date);
create index if not exists idx_ad_spend_sku          on ad_spend(sku_id);
create index if not exists idx_ad_spend_date         on ad_spend(date);
