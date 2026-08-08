-- USAF Voucher Packages v18 - Delete Policies
-- Run this in Supabase SQL Editor before testing Delete Package or Remove Receipt.

drop policy if exists "USAF vouchers delete own or admin" on public."USAF_vouchers";
create policy "USAF vouchers delete own or admin"
on public."USAF_vouchers"
for delete
to authenticated
using (
  user_id = auth.uid()
  or public."USAF_is_admin"()
);

drop policy if exists "USAF voucher items delete own or admin" on public."USAF_voucher_items";
create policy "USAF voucher items delete own or admin"
on public."USAF_voucher_items"
for delete
to authenticated
using (
  public."USAF_is_admin"()
  or exists (
    select 1
    from public."USAF_vouchers" v
    where v.id = voucher_id
      and v.user_id = auth.uid()
  )
);
