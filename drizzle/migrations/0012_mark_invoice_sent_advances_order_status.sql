CREATE OR REPLACE FUNCTION public.invoice_sent_updates_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  IF NEW.sent_at IS NULL OR OLD.sent_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, status INTO o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'proforma' AND o.status = 'confirmed' THEN
    UPDATE public.orders SET status = 'loading', updated_at = now() WHERE id = o.id;
    INSERT INTO public.order_events (order_id, actor_role, event_type, previous_status, new_status)
    VALUES (o.id, 'staff', 'proforma_sent', 'confirmed', 'loading');
  ELSIF NEW.kind = 'commercial' AND o.status IN ('confirmed', 'loading') THEN
    UPDATE public.orders SET status = 'shipped', shipped_at = COALESCE(shipped_at, now()), updated_at = now() WHERE id = o.id;
    INSERT INTO public.order_events (order_id, actor_role, event_type, previous_status, new_status)
    VALUES (o.id, 'staff', 'commercial_sent', o.status::text, 'shipped');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_sent_updates_order
AFTER UPDATE OF sent_at ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoice_sent_updates_order();