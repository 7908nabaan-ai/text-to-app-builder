create policy "Signed-in users view product images" on storage.objects for select to authenticated using (bucket_id = 'product-images');
create policy "Staff upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_staff());
create policy "Staff update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_staff());
create policy "Staff delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_staff());