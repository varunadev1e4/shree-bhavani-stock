-- Update 2: rack numbers + party balances. Run once in Supabase > SQL Editor.
alter table products add column if not exists rack_no text;

create table if not exists parties (
  id bigint primary key, code text, name text, city text,
  phone text, phone2 text, cur_bal numeric, group_id bigint,
  deleted boolean default false, sync_id text
);
alter table parties enable row level security;
create policy "logged in can read" on parties for select to authenticated using (true);

create or replace view stock_summary with (security_invoker = true) as
select
  p.id, p.code, p.name, p.packing, p.mrp, p.gst,
  c.name as company,
  coalesce(sum(b.qty), 0) as total_qty,
  min(b.exp_year * 100 + b.exp_month) filter (where b.qty > 0) as nearest_expiry,
  p.rack_no
from products p
left join companies c on c.id = p.company_id
left join batches b on b.product_id = p.id
where coalesce(p.deleted, false) = false
group by p.id, c.name;
