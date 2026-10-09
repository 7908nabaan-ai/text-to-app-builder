CREATE OR REPLACE FUNCTION public.protect_order_line_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare p public.products%rowtype; cat text; st text;
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
  select status::text into st from public.orders where id = new.order_id;
  if new.requested_quantity is distinct from old.requested_quantity and st <> 'draft' then
    raise exception 'The original request is locked once the order is submitted.' using errcode = '42501';
  end if;
  if new.sku is distinct from old.sku or new.product_name is distinct from old.product_name or new.product_id is distinct from old.product_id
     or new.unit is distinct from old.unit or new.cbm_per_carton is distinct from old.cbm_per_carton
     or new.gross_weight_kg is distinct from old.gross_weight_kg or new.catalog_price is distinct from old.catalog_price
     or new.negotiated_price is distinct from old.negotiated_price or new.proposed_quantity is distinct from old.proposed_quantity
     or new.final_quantity is distinct from old.final_quantity then
    raise exception 'Only Sky Plus staff can change prices or product details.' using errcode = '42501';
  end if;
  return new;
end; $$;