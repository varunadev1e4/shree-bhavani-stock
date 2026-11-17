-- Shree Bhavani stock app - run once in Supabase > SQL Editor

create table if not exists companies (
  id bigint primary key,
  name text,
  short_name text,
  deleted boolean default false,
  sync_id text
);

create table if not exists products (
  id bigint primary key,
  code text,
  name text not null,
  packing text,
  mrp numeric,
  gst numeric,
  company_id bigint,
  deleted boolean default false,
  sync_id text
);

create table if not exists batches (
  id bigint primary key,
  product_id bigint not null,
  batch_no text,
  exp_month int,
  exp_year int,
  qty numeric,
  mrp numeric,
  bill_price numeric,
  sync_id text
);
create index if not exists batches_product_idx on batches(product_id);
create index if not exists products_name_idx on products(lower(name));

create table if not exists sync_log (
  id bigserial primary key,
  ran_at timestamptz default now(),
  source text,
  products int,
  batches int
);

-- Only logged-in users can read. Nobody can write from the app.
-- The sync script uses the secret key, which bypasses these rules.
alter table companies enable row level security;
alter table products  enable row level security;
alter table batches   enable row level security;
alter table sync_log  enable row level security;

create policy "logged in can read" on companies for select to authenticated using (true);
create policy "logged in can read" on products  for select to authenticated using (true);
create policy "logged in can read" on batches   for select to authenticated using (true);
create policy "logged in can read" on sync_log  for select to authenticated using (true);

-- One row per product with total stock and nearest expiry (as YYYYMM)
create or replace view stock_summary with (security_invoker = true) as
select
  p.id, p.code, p.name, p.packing, p.mrp, p.gst,
  c.name as company,
  coalesce(sum(b.qty), 0) as total_qty,
  min(b.exp_year * 100 + b.exp_month) filter (where b.qty > 0) as nearest_expiry
from products p
left join companies c on c.id = p.company_id
left join batches b on b.product_id = p.id
where coalesce(p.deleted, false) = false
group by p.id, c.name;
