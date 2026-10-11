CREATE OR REPLACE FUNCTION public.invalidate_negotiation_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders%rowtype; oid uuid;
BEGIN
  oid := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  SELECT * INTO o FROM public.orders WHERE id = oid FOR UPDATE;
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'Order lines cannot be moved between orders.'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.current_quantity IS NOT DISTINCT FROM OLD.current_quantity AND NEW.negotiated_price IS NOT DISTINCT FROM OLD.negotiated_price AND NEW.proposed_quantity IS NOT DISTINCT FROM OLD.proposed_quantity AND NEW.availability IS NOT DISTINCT FROM OLD.availability AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id AND NEW.unit IS NOT DISTINCT FROM OLD.unit AND NEW.cbm_per_carton IS NOT DISTINCT FROM OLD.cbm_per_carton AND NEW.gross_weight_kg IS NOT DISTINCT FROM OLD.gross_weight_kg AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN RETURN NEW; END IF;
  IF NOT public.is_staff() AND (o.is_locked OR o.status NOT IN ('draft','submitted','under_review','awaiting_customer','customer_updated')) THEN RAISE EXCEPTION 'This order is not open for customer changes.' USING ERRCODE = '42501'; END IF;
  IF o.status IN ('confirmed','loading','shipped','completed') THEN RAISE EXCEPTION 'Reopen negotiation before changing finalized order terms.'; END IF;
  IF o.customer_approved_at IS NOT NULL THEN
    UPDATE public.orders SET customer_approved_at = NULL, customer_approved_by = NULL, status = 'under_review', is_locked = false WHERE id = oid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;