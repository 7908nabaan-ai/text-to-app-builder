GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.app_settings TO anon;
CREATE POLICY "Public can view active products" ON public.products FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Public can view active categories" ON public.categories FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Public can view contact settings" ON public.app_settings FOR SELECT TO anon USING (true);