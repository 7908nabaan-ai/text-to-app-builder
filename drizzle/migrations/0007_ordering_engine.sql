ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gross_weight_kg numeric;
ALTER TABLE public.container_types ADD COLUMN IF NOT EXISTS max_weight_kg numeric NOT NULL DEFAULT 0;
ALTER TABLE public.container_types ADD COLUMN IF NOT EXISTS warning_percent numeric NOT NULL DEFAULT 90;
ALTER TABLE public.container_types ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS container_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS container_max_weight_kg numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS container_warning_percent numeric;
ALTER TABLE public.order_lines ADD COLUMN IF NOT EXISTS gross_weight_kg numeric NOT NULL DEFAULT 0;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS myr_rate numeric NOT NULL DEFAULT 3.95;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at timestamptz;

UPDATE public.container_types SET max_weight_kg = 28000, sort_order = 1 WHERE code = '20FT' AND max_weight_kg = 0;
UPDATE public.container_types SET max_weight_kg = 26500, sort_order = 2 WHERE code = '40FT' AND max_weight_kg = 0;
INSERT INTO public.container_types (code, name, capacity_cbm, max_weight_kg, sort_order, is_active)
VALUES ('40HC', '40 FT High Cube', 76, 26500, 3, true) ON CONFLICT (code) DO NOTHING;
UPDATE public.orders o SET container_name = c.name, container_max_weight_kg = c.max_weight_kg, container_warning_percent = c.warning_percent
FROM public.container_types c WHERE c.id = o.container_type_id AND o.container_name IS NULL;

CREATE TABLE IF NOT EXISTS public.favourite_products (
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.favourite_products TO authenticated;
GRANT ALL ON public.favourite_products TO service_role;
ALTER TABLE public.favourite_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favourites read" ON public.favourite_products FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own favourites add" ON public.favourite_products FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own favourites remove" ON public.favourite_products FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Snapshot container limits onto orders
CREATE OR REPLACE FUNCTION public.snapshot_order_container()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare c public.container_types%rowtype;
begin
  if tg_op = 'INSERT' or new.container_type_id is distinct from old.container_type_id then
    select * into c from public.container_types where id = new.container_type_id;
    if c.id is null then raise exception 'Unknown container type'; end if;
    new.container_name := c.name;
    new.container_capacity_cbm := c.capacity_cbm;
    new.container_max_weight_kg := c.max_weight_kg;
    new.container_warning_percent := c.warning_percent;
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS orders_container_snapshot ON public.orders;
CREATE TRIGGER orders_container_snapshot BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_container();

-- Customers cannot set prices or product master data on order lines
CREATE OR REPLACE FUNCTION public.protect_order_line_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare p public.products%rowtype; cat text;
begin
  if public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    select * into p from public.products where id = new.product_id and is_active;
    if p.id is null then raise exception 'Product not available'; end if;
    select name into cat from public.categories where id = p.category_id;
    new.sku := p.sku; new.product_name := p.name; new.category_name := cat; new.image_path := p.image_path;
    new.unit := p.unit; new.cbm_per_carton := p.cbm_per_carton; new.gross_weight_kg := coalesce(p.gross_weight_kg, 0);
    new.catalog_price := p.default_price; new.negotiated_price := p.default_price;
    new.proposed_quantity := null; new.final_quantity := null;
    return new;
  end if;
  if new.sku is distinct from old.sku or new.product_name is distinct from old.product_name or new.product_id is distinct from old.product_id
     or new.unit is distinct from old.unit or new.cbm_per_carton is distinct from old.cbm_per_carton
     or new.gross_weight_kg is distinct from old.gross_weight_kg or new.catalog_price is distinct from old.catalog_price
     or new.negotiated_price is distinct from old.negotiated_price or new.proposed_quantity is distinct from old.proposed_quantity
     or new.final_quantity is distinct from old.final_quantity or new.requested_quantity is distinct from old.requested_quantity then
    raise exception 'Only Sky Plus staff can change prices or product details.' using errcode = '42501';
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS order_lines_protect_master ON public.order_lines;
CREATE TRIGGER order_lines_protect_master BEFORE INSERT OR UPDATE ON public.order_lines
FOR EACH ROW EXECUTE FUNCTION public.protect_order_line_master();