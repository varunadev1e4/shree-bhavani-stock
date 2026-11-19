-- Update 10: staff management (not connected to Profit Maker). Run once in Supabase > SQL Editor.
create table if not exists employees (
  id bigint generated always as identity primary key,
  name text not null, phone text, role text,
  salary numeric default 0,           -- monthly salary
  join_date date, active boolean default true, note text,
  created_at timestamptz default now()
);
create table if not exists emp_entries (
  id bigint generated always as identity primary key,
  emp_id bigint not null references employees(id) on delete cascade,
  d date not null,
  kind text not null,   -- absent | half | paidleave | advance | recovery | salary | bonus | deduction
  amount numeric default 0, note text,
  created_at timestamptz default now()
);
create index if not exists emp_entries_emp on emp_entries(emp_id, d);
alter table employees enable row level security;
alter table emp_entries enable row level security;
create policy "emp all" on employees for all to authenticated using (true) with check (true);
create policy "ent all" on emp_entries for all to authenticated using (true) with check (true);
