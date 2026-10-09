CREATE OR REPLACE FUNCTION public.lock_invoice_amounts()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
begin
  if new.product_value is distinct from old.product_value or new.freight_charges is distinct from old.freight_charges
     or new.handling_charges is distinct from old.handling_charges or new.total_value is distinct from old.total_value
     or new.advance_amount is distinct from old.advance_amount then
    raise exception 'Issued invoices are locked. Re-issue to create a new version.' using errcode = '42501';
  end if;
  return new;
end; $$;
CREATE TRIGGER invoices_lock_amounts BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_amounts();