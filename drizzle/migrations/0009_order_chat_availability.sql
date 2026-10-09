ALTER TABLE public.order_lines ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available';
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_availability_check CHECK (availability IN ('available','preorder','unavailable'));

CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  sender_role text NOT NULL DEFAULT 'customer',
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_messages_order_idx ON public.order_messages(order_id, created_at);
GRANT SELECT, INSERT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages visible to order owner or staff" ON public.order_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.customer_id = auth.uid() OR public.is_staff())));
CREATE POLICY "order owner or staff send messages" ON public.order_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.customer_id = auth.uid() OR public.is_staff())));

CREATE OR REPLACE FUNCTION public.set_message_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare o public.orders%rowtype;
begin
  new.sender_role := case when public.is_staff() then 'staff' else 'customer' end;
  select * into o from public.orders where id = new.order_id;
  if new.sender_role = 'staff' then
    insert into public.notifications (user_id, order_id, title, body)
    values (o.customer_id, o.id, 'New message on ' || o.order_number, left(new.body, 140));
  end if;
  return new;
end; $$;
CREATE TRIGGER order_messages_role BEFORE INSERT ON public.order_messages FOR EACH ROW EXECUTE FUNCTION public.set_message_role();

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
    new.proposed_quantity := null; new.final_quantity := null; new.availability := 'available';
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
     or new.final_quantity is distinct from old.final_quantity or new.availability is distinct from old.availability then
    raise exception 'Only Sky Plus staff can change prices or product details.' using errcode = '42501';
  end if;
  return new;
end; $$;