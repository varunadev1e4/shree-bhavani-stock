-- Update 11: shop expenses (not connected to Profit Maker). Run once in Supabase > SQL Editor.
create table if not exists expenses (
  id bigint generated always as identity primary key,
  d date not null, category text not null, amount numeric not null, note text,
  created_at timestamptz default now()
);
create index if not exists expenses_d on expenses(d);
alter table expenses enable row level security;
create policy "exp all" on expenses for all to authenticated using (true) with check (true);
