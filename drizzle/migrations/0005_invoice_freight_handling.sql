ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS product_value numeric,
  ADD COLUMN IF NOT EXISTS freight_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_charges numeric NOT NULL DEFAULT 0;
UPDATE public.invoices SET product_value = total_value WHERE product_value IS NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_charges_nonneg CHECK (freight_charges >= 0 AND handling_charges >= 0);

DROP FUNCTION IF EXISTS public.issue_invoice(uuid, invoice_kind, numeric, numeric);

CREATE OR REPLACE FUNCTION public.issue_invoice(_order_id uuid, _kind invoice_kind, _advance_percent numeric DEFAULT NULL, _advance_amount numeric DEFAULT NULL, _freight numeric DEFAULT 0, _handling numeric DEFAULT 0)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype; v_prev public.invoices%rowtype;
  v_number text; v_version int := 1; v_id uuid; v_cbm numeric; v_value numeric; v_adv numeric := 0;
  v_code text; v_settings public.app_settings%rowtype;
  v_freight numeric := 0; v_handling numeric := 0; v_total numeric;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if coalesce(_freight,0) < 0 or coalesce(_handling,0) < 0 then raise exception 'Charges cannot be negative'; end if;
  select * into v_order from public.orders where id = _order_id;
  if v_order.id is null then raise exception 'Order not found'; end if;

  select coalesce(sum(cbm_per_carton * coalesce(final_quantity, current_quantity)),0),
         coalesce(sum(negotiated_price * coalesce(final_quantity, current_quantity)),0)
    into v_cbm, v_value
    from public.order_lines where order_id = _order_id and coalesce(final_quantity, current_quantity) > 0;
  if v_value = 0 then raise exception 'Order has no items to invoice'; end if;
  v_value := round(v_value, 2);

  if _kind = 'commercial' then
    v_freight := round(coalesce(_freight,0), 2); v_handling := round(coalesce(_handling,0), 2);
  end if;
  v_total := v_value + v_freight + v_handling;

  if _advance_amount is not null and _advance_amount > 0 then v_adv := round(_advance_amount, 2);
  elsif _advance_percent is not null and _advance_percent > 0 then v_adv := round(v_value * _advance_percent / 100, 2);
  end if;

  select * into v_prev from public.invoices
    where order_id = _order_id and kind = _kind and state = 'current' order by version desc limit 1;
  if v_prev.id is not null then
    v_number := v_prev.invoice_number; v_version := v_prev.version + 1;
    update public.invoices set state = 'superseded' where id = v_prev.id;
  else
    v_number := (case when _kind = 'proforma' then 'PI-' else 'CI-' end) || nextval('public.invoice_number_seq')::text;
  end if;

  select code into v_code from public.container_types where id = v_order.container_type_id;
  select * into v_settings from public.app_settings limit 1;

  insert into public.invoices (order_id, customer_id, kind, invoice_number, version, container_code, total_cbm,
    container_capacity_cbm, product_value, freight_charges, handling_charges, total_value, advance_percent, advance_amount, currency, payment_instructions, created_by)
  values (_order_id, v_order.customer_id, _kind, v_number, v_version, v_code, round(v_cbm,4),
    v_order.container_capacity_cbm, v_value, v_freight, v_handling, v_total, _advance_percent, v_adv,
    coalesce(v_settings.currency,'USD'), v_settings.payment_instructions, auth.uid())
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, sku, product_name, unit, quantity, price, cbm_per_carton, total_cbm, subtotal)
  select v_id, sku, product_name, unit, coalesce(final_quantity, current_quantity), negotiated_price, cbm_per_carton,
         round(cbm_per_carton * coalesce(final_quantity, current_quantity),4),
         round(negotiated_price * coalesce(final_quantity, current_quantity),2)
  from public.order_lines where order_id = _order_id and coalesce(final_quantity, current_quantity) > 0;

  update public.orders set advance_percent = _advance_percent, advance_amount = v_adv where id = _order_id;

  insert into public.notifications (user_id, order_id, title, body)
  values (v_order.customer_id, _order_id,
    (case when _kind='proforma' then 'Proforma invoice ' else 'Commercial invoice ' end) || v_number || ' v' || v_version,
    'A new invoice is ready in Sky Plus.');

  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'invoice_issued', 'invoice', v_id::text,
    jsonb_build_object('number', v_number, 'version', v_version, 'freight', v_freight, 'handling', v_handling, 'total', v_total));
  return v_id;
end; $function$;
REVOKE EXECUTE ON FUNCTION public.issue_invoice(uuid, invoice_kind, numeric, numeric, numeric, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, invoice_kind, numeric, numeric, numeric, numeric) TO authenticated;