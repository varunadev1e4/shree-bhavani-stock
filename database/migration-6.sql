-- Update 6: pending bills for the To receive / To pay screens. Run once in Supabase > SQL Editor.
create table if not exists pending_bills (
  id bigint generated always as identity primary key,
  party_id bigint not null,
  kind text not null,            -- R = receivable (sale bill), P = payable (purchase bill)
  bill_no text,
  ref_no text,                   -- supplier's invoice number (payables)
  bill_date date,
  total numeric, paid numeric, balance numeric
);
create index if not exists pending_bills_party on pending_bills(party_id);
alter table pending_bills enable row level security;
create policy "logged in can read" on pending_bills for select to authenticated using (true);
