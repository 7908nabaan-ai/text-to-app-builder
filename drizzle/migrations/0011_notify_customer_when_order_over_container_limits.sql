CREATE OR REPLACE FUNCTION public.notify_order_over_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  t_cbm numeric;
  t_weight numeric;
  over_cbm boolean;
  over_weight boolean;
  msg text;
BEGIN
  SELECT id, customer_id, order_number, container_capacity_cbm, container_max_weight_kg
    INTO o FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF NOT FOUND OR o.customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(cbm_per_carton * COALESCE(final_quantity, current_quantity)), 0),
         COALESCE(SUM(gross_weight_kg * COALESCE(final_quantity, current_quantity)), 0)
    INTO t_cbm, t_weight
    FROM public.order_lines WHERE order_id = o.id;

  over_cbm := o.container_capacity_cbm IS NOT NULL AND o.container_capacity_cbm > 0 AND t_cbm > o.container_capacity_cbm;
  over_weight := o.container_max_weight_kg IS NOT NULL AND o.container_max_weight_kg > 0 AND t_weight > o.container_max_weight_kg;

  IF NOT over_cbm AND NOT over_weight THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Do not spam: skip when an unread over-limit notification already exists for this order.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE order_id = o.id AND user_id = o.customer_id AND is_read = false AND title = 'Container limit exceeded'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  msg := CASE
    WHEN over_cbm AND over_weight THEN 'Order ' || o.order_number || ' exceeds both the container volume (' || round(t_cbm, 2) || ' of ' || round(o.container_capacity_cbm, 2) || ' CBM) and the maximum gross weight (' || round(t_weight, 1) || ' of ' || round(o.container_max_weight_kg, 1) || ' kg). Please adjust your order.'
    WHEN over_cbm THEN 'Order ' || o.order_number || ' exceeds the container volume: ' || round(t_cbm, 2) || ' CBM used of ' || round(o.container_capacity_cbm, 2) || ' CBM. Please adjust your order.'
    ELSE 'Order ' || o.order_number || ' exceeds the maximum gross weight: ' || round(t_weight, 1) || ' kg of ' || round(o.container_max_weight_kg, 1) || ' kg. Please adjust your order.'
  END;

  INSERT INTO public.notifications (user_id, order_id, title, body)
  VALUES (o.customer_id, o.id, 'Container limit exceeded', msg);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER order_lines_over_limit_notify
AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
FOR EACH ROW EXECUTE FUNCTION public.notify_order_over_limit();