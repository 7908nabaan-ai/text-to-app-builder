ALTER TABLE public.orders ADD COLUMN customer_approved_at timestamptz, ADD COLUMN customer_approved_by uuid;

CREATE OR REPLACE FUNCTION public.guard_negotiation_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE staff boolean := public.is_staff();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.customer_approved_at := NULL; NEW.customer_approved_by := NULL;
    IF NOT staff AND (NEW.status <> 'draft' OR NEW.is_locked OR NEW.finalized_at IS NOT NULL) THEN
      RAISE EXCEPTION 'New customer orders must start as drafts.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT staff THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at THEN
      RAISE EXCEPTION 'Only Sky Plus can finalize orders.' USING ERRCODE = '42501';
    END IF;
    IF NEW.customer_approved_at IS DISTINCT FROM OLD.customer_approved_at OR NEW.customer_approved_by IS DISTINCT FROM OLD.customer_approved_by THEN
      IF auth.uid() IS DISTINCT FROM OLD.customer_id OR OLD.status <> 'awaiting_customer' OR NEW.status <> 'customer_updated' OR NEW.customer_approved_at IS NULL THEN
        RAISE EXCEPTION 'Customer approval requires an order awaiting customer review.' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.order_lines WHERE order_id = OLD.id) THEN RAISE EXCEPTION 'An empty order cannot be approved.'; END IF;
      NEW.customer_approved_at := now(); NEW.customer_approved_by := auth.uid(); NEW.is_locked := true;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status = 'submitted') OR (OLD.status = 'awaiting_customer' AND NEW.status = 'customer_updated')) THEN
      RAISE EXCEPTION 'Only Sky Plus can give final approval.' USING ERRCODE = '42501';
    ELSIF NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN
      RAISE EXCEPTION 'Only Sky Plus can lock or reopen orders.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.customer_approved_at IS DISTINCT FROM OLD.customer_approved_at OR NEW.customer_approved_by IS DISTINCT FROM OLD.customer_approved_by THEN
      IF NEW.customer_approved_at IS NOT NULL OR NEW.customer_approved_by IS NOT NULL THEN RAISE EXCEPTION 'Only the customer can approve negotiated terms.' USING ERRCODE = '42501'; END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('under_review', 'awaiting_customer') THEN
      NEW.customer_approved_at := NULL; NEW.customer_approved_by := NULL; NEW.is_locked := false;
    END IF;
    IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
      IF OLD.status <> 'customer_updated' OR OLD.customer_approved_at IS NULL OR OLD.customer_approved_by IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'The customer must approve the negotiated order before Sky Plus final approval.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.order_lines WHERE order_id = OLD.id) OR EXISTS (SELECT 1 FROM public.order_lines WHERE order_id = OLD.id AND approval_status = 'pending') THEN
        RAISE EXCEPTION 'An owner must review every order line before final approval.';
      END IF;
      NEW.finalized_at := now(); NEW.is_locked := true;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('loading', 'shipped', 'completed') AND OLD.status NOT IN ('confirmed', 'loading', 'shipped', 'completed') THEN
      RAISE EXCEPTION 'Sky Plus final approval is required before shipment or completion.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_negotiation_approval BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_negotiation_approval();

CREATE OR REPLACE FUNCTION public.invalidate_negotiation_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%rowtype; oid uuid;
BEGIN
  oid := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  SELECT * INTO o FROM public.orders WHERE id = oid FOR UPDATE;
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'Order lines cannot be moved between orders.'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.current_quantity IS NOT DISTINCT FROM OLD.current_quantity AND NEW.negotiated_price IS NOT DISTINCT FROM OLD.negotiated_price AND NEW.proposed_quantity IS NOT DISTINCT FROM OLD.proposed_quantity AND NEW.availability IS NOT DISTINCT FROM OLD.availability AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id AND NEW.unit IS NOT DISTINCT FROM OLD.unit AND NEW.cbm_per_carton IS NOT DISTINCT FROM OLD.cbm_per_carton AND NEW.gross_weight_kg IS NOT DISTINCT FROM OLD.gross_weight_kg AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN RETURN NEW; END IF;
  IF NOT public.is_staff() AND (o.is_locked OR o.status NOT IN ('draft','awaiting_customer')) THEN RAISE EXCEPTION 'This order is not open for customer changes.' USING ERRCODE = '42501'; END IF;
  IF o.status IN ('confirmed','loading','shipped','completed') THEN RAISE EXCEPTION 'Reopen negotiation before changing finalized order terms.'; END IF;
  IF o.customer_approved_at IS NOT NULL THEN
    UPDATE public.orders SET customer_approved_at = NULL, customer_approved_by = NULL, status = 'under_review', is_locked = false WHERE id = oid;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_lines_acceptance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.order_lines FOR EACH ROW EXECUTE FUNCTION public.invalidate_negotiation_acceptance();

CREATE OR REPLACE FUNCTION public.record_negotiation_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_approved_at IS NOT NULL AND OLD.customer_approved_at IS DISTINCT FROM NEW.customer_approved_at THEN
    INSERT INTO public.order_events(order_id, actor_id, actor_role, event_type, previous_status, new_status) VALUES (NEW.id, auth.uid(), 'customer', 'customer_approved', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    UPDATE public.order_lines SET final_quantity = current_quantity WHERE order_id = NEW.id;
    INSERT INTO public.order_events(order_id, actor_id, actor_role, event_type, previous_status, new_status) VALUES (NEW.id, auth.uid(), 'staff', 'sky_plus_final_approval', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.container_type_id IS DISTINCT FROM OLD.container_type_id AND NEW.customer_approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Reopen negotiation before changing the accepted container.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_record_negotiation_approval AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_negotiation_approval();