CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Per-product negotiation
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS added_by_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negotiation_status text NOT NULL DEFAULT 'awaiting_skyplus',
  ADD COLUMN IF NOT EXISTS agreed_quantity integer,
  ADD COLUMN IF NOT EXISTS customer_proposed_qty integer;

UPDATE public.order_lines SET added_by_staff = (requested_quantity = 0),
  negotiation_status = CASE WHEN final_quantity IS NOT NULL THEN 'confirmed' WHEN proposed_quantity IS NOT NULL OR requested_quantity = 0 THEN 'awaiting_customer' ELSE 'awaiting_skyplus' END,
  agreed_quantity = final_quantity;

ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_negotiation_status_check
  CHECK (negotiation_status IN ('awaiting_skyplus','awaiting_customer','confirmed','rejected','reopened'));

CREATE OR REPLACE FUNCTION public.guard_line_negotiation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE flag boolean := coalesce(current_setting('skyplus.negotiation', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.added_by_staff := public.is_staff();
    NEW.agreed_quantity := NULL; NEW.customer_proposed_qty := NULL;
    IF NEW.added_by_staff THEN
      NEW.negotiation_status := 'awaiting_customer';
      NEW.proposed_quantity := coalesce(NEW.proposed_quantity, NEW.current_quantity);
    ELSE
      NEW.negotiation_status := 'awaiting_skyplus';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_staff() AND NOT flag AND EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id AND status <> 'draft') THEN
      RAISE EXCEPTION 'Removing an item during negotiation needs your PIN.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NOT public.is_staff() AND NOT flag AND (NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status
     OR NEW.agreed_quantity IS DISTINCT FROM OLD.agreed_quantity OR NEW.customer_proposed_qty IS DISTINCT FROM OLD.customer_proposed_qty) THEN
    RAISE EXCEPTION 'Use the negotiation actions to change this item.' USING ERRCODE = '42501';
  END IF;
  NEW.added_by_staff := OLD.added_by_staff; -- origin is permanent
  RETURN NEW;
END $$;

CREATE TRIGGER order_lines_zz_negotiation BEFORE INSERT OR UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_line_negotiation();

CREATE OR REPLACE FUNCTION public.negotiate_line(_line_id uuid, _action text, _quantity integer DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.order_lines%rowtype; o public.orders%rowtype; staff boolean := public.is_staff(); q integer; st text;
BEGIN
  SELECT * INTO l FROM public.order_lines WHERE id = _line_id FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = l.order_id;
  IF NOT staff AND o.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF o.status::text IN ('confirmed','loading','shipped','completed','cancelled') THEN RAISE EXCEPTION 'This order is finalized.'; END IF;
  IF NOT staff AND o.is_locked THEN RAISE EXCEPTION 'This order is locked while Sky Plus reviews your approval.'; END IF;
  PERFORM set_config('skyplus.negotiation', 'on', true);
  IF _action = 'propose' THEN
    IF _quantity IS NULL OR _quantity < 0 THEN RAISE EXCEPTION 'Enter a carton quantity.'; END IF;
    q := _quantity;
    IF staff THEN
      UPDATE public.order_lines SET proposed_quantity = q, negotiation_status = 'awaiting_customer', current_quantity = coalesce(agreed_quantity, q) WHERE id = l.id;
    ELSIF o.status = 'draft' THEN
      UPDATE public.order_lines SET requested_quantity = q, current_quantity = q, negotiation_status = 'awaiting_skyplus' WHERE id = l.id;
    ELSE
      UPDATE public.order_lines SET customer_proposed_qty = q, negotiation_status = 'awaiting_skyplus', current_quantity = coalesce(agreed_quantity, q) WHERE id = l.id;
    END IF;
  ELSIF _action IN ('confirm','reject') THEN
    IF (staff AND l.negotiation_status <> 'awaiting_skyplus') OR (NOT staff AND l.negotiation_status <> 'awaiting_customer') THEN
      RAISE EXCEPTION 'There is no proposal from the other side to answer.';
    END IF;
    IF _action = 'confirm' THEN
      q := CASE WHEN staff THEN coalesce(l.customer_proposed_qty, l.requested_quantity) ELSE coalesce(l.proposed_quantity, l.current_quantity) END;
      UPDATE public.order_lines SET agreed_quantity = q, negotiation_status = 'confirmed', current_quantity = q WHERE id = l.id;
    ELSE
      q := coalesce(l.agreed_quantity, 0);
      UPDATE public.order_lines SET negotiation_status = CASE WHEN l.agreed_quantity IS NOT NULL THEN 'confirmed' ELSE 'rejected' END, current_quantity = q WHERE id = l.id;
    END IF;
  ELSIF _action = 'reopen' THEN
    IF l.negotiation_status NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'Only confirmed or rejected items can be reopened.'; END IF;
    q := l.current_quantity;
    UPDATE public.order_lines SET negotiation_status = 'reopened' WHERE id = l.id;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  st := CASE WHEN staff THEN 'staff' ELSE 'customer' END;
  INSERT INTO public.order_events(order_id, actor_id, actor_role, event_type, sku, product_name, previous_quantity, new_quantity, reason)
  VALUES (l.order_id, auth.uid(), st, 'item_' || _action, l.sku, l.product_name, l.current_quantity, q, _note);
  IF staff THEN
    INSERT INTO public.notifications(user_id, order_id, title, body)
    VALUES (o.customer_id, o.id, 'Update on ' || o.order_number, l.product_name || ': Sky Plus ' || CASE _action WHEN 'propose' THEN 'proposed ' || q || ' cartons' WHEN 'confirm' THEN 'confirmed ' || q || ' cartons' WHEN 'reject' THEN 'rejected the request' ELSE 'reopened the item' END);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.negotiate_line(uuid, text, integer, text) TO authenticated;

-- PIN
CREATE TABLE public.user_pins (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_pins TO service_role;
ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_pin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_pins WHERE user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.set_pin(_pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE existed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  IF _pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN must be 4 to 6 digits.'; END IF;
  existed := EXISTS (SELECT 1 FROM public.user_pins WHERE user_id = auth.uid());
  INSERT INTO public.user_pins(user_id, pin_hash, updated_at) VALUES (auth.uid(), extensions.crypt(_pin, extensions.gen_salt('bf')), now())
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = excluded.pin_hash, updated_at = now();
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id) VALUES (auth.uid(), CASE WHEN existed THEN 'pin_changed' ELSE 'pin_created' END, 'user', auth.uid()::text);
END $$;
CREATE OR REPLACE FUNCTION public.check_pin(_pin text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_pins WHERE user_id = auth.uid() AND pin_hash = extensions.crypt(_pin, pin_hash))
$$;
REVOKE EXECUTE ON FUNCTION public.check_pin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_line_with_pin(_line_id uuid, _pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.order_lines%rowtype; o public.orders%rowtype;
BEGIN
  SELECT * INTO l FROM public.order_lines WHERE id = _line_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = l.order_id;
  IF o.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF o.is_locked OR o.status::text NOT IN ('draft','submitted','under_review','awaiting_customer','customer_updated') THEN RAISE EXCEPTION 'This item can no longer be removed.'; END IF;
  IF l.negotiation_status = 'confirmed' THEN RAISE EXCEPTION 'Reopen the confirmed item before removing it.'; END IF;
  IF o.status <> 'draft' AND NOT public.check_pin(_pin) THEN RAISE EXCEPTION 'Incorrect PIN.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('skyplus.negotiation', 'on', true);
  DELETE FROM public.order_lines WHERE id = l.id;
  INSERT INTO public.order_events(order_id, actor_id, actor_role, event_type, sku, product_name, previous_quantity, new_quantity, reason)
  VALUES (o.id, auth.uid(), 'customer', 'line_removed', l.sku, l.product_name, l.current_quantity, 0, CASE WHEN o.status <> 'draft' THEN 'PIN confirmed' END);
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, details) VALUES (auth.uid(), 'order_line_removed', 'order', o.id::text, jsonb_build_object('sku', l.sku, 'quantity', l.current_quantity));
END $$;
GRANT EXECUTE ON FUNCTION public.remove_line_with_pin(uuid, text) TO authenticated;

-- Cancellation / draft deletion
CREATE OR REPLACE FUNCTION public.guard_negotiation_approval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE staff boolean := public.is_staff();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.customer_approved_at := NULL; NEW.customer_approved_by := NULL;
    IF NOT staff AND (NEW.status <> 'draft' OR NEW.is_locked OR NEW.finalized_at IS NOT NULL) THEN
      RAISE EXCEPTION 'New customer orders must start as drafts.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('skyplus.cancel', true), '') = 'on' THEN RETURN NEW; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid, _reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR (o.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_staff()) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF o.status::text NOT IN ('submitted','under_review','awaiting_customer','customer_updated') THEN RAISE EXCEPTION 'Only orders under negotiation can be cancelled.'; END IF;
  PERFORM set_config('skyplus.cancel', 'on', true);
  UPDATE public.orders SET status = 'cancelled', is_locked = true WHERE id = o.id;
  INSERT INTO public.order_events(order_id, actor_id, actor_role, event_type, previous_status, new_status, reason)
  VALUES (o.id, auth.uid(), CASE WHEN public.is_staff() THEN 'staff' ELSE 'customer' END, 'order_cancelled', o.status::text, 'cancelled', _reason);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_draft_order(_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%rowtype;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR o.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'Only draft orders can be deleted.'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id = o.id) OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id) THEN RAISE EXCEPTION 'This order has financial records and cannot be deleted.'; END IF;
  PERFORM set_config('skyplus.negotiation', 'on', true);
  DELETE FROM public.notifications WHERE order_id = o.id;
  DELETE FROM public.order_messages WHERE order_id = o.id;
  DELETE FROM public.order_events WHERE order_id = o.id;
  DELETE FROM public.order_lines WHERE order_id = o.id;
  DELETE FROM public.orders WHERE id = o.id;
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, details) VALUES (auth.uid(), 'draft_order_deleted', 'order', o.id::text, jsonb_build_object('order_number', o.order_number));
END $$;
GRANT EXECUTE ON FUNCTION public.delete_draft_order(uuid) TO authenticated;

-- Order documents
CREATE TABLE public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  customer_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  uploader_role text NOT NULL DEFAULT 'customer',
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','staff')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_documents_order_idx ON public.order_documents(order_id);
GRANT SELECT, INSERT, DELETE ON public.order_documents TO authenticated;
GRANT ALL ON public.order_documents TO service_role;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_document_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT customer_id INTO NEW.customer_id FROM public.orders WHERE id = NEW.order_id;
  NEW.uploaded_by := auth.uid();
  NEW.uploader_role := CASE WHEN public.is_staff() THEN 'staff' ELSE 'customer' END;
  IF NEW.uploader_role = 'customer' THEN NEW.visibility := 'shared'; END IF;
  IF split_part(NEW.file_path, '/', 1) <> NEW.order_id::text THEN RAISE EXCEPTION 'File must be stored under its order.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_documents_owner BEFORE INSERT ON public.order_documents FOR EACH ROW EXECUTE FUNCTION public.set_document_owner();

CREATE POLICY "read order documents" ON public.order_documents FOR SELECT TO authenticated
  USING (public.is_staff() OR (visibility = 'shared' AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())));
CREATE POLICY "add order documents" ON public.order_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));
CREATE POLICY "staff remove order documents" ON public.order_documents FOR DELETE TO authenticated USING (public.is_staff());

CREATE POLICY "order docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-documents' AND EXISTS (SELECT 1 FROM public.order_documents d WHERE d.file_path = storage.objects.name));
CREATE POLICY "order docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-documents' AND (public.is_staff() OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = (storage.foldername(name))[1] AND o.customer_id = auth.uid())));

ALTER TABLE public.order_messages ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.order_documents(id);

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ai_suggestions_enabled boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
EXCEPTION WHEN others THEN NULL; END $$;
