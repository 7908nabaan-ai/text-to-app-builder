ALTER TABLE public.order_lines
  ADD COLUMN approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz;
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));

CREATE OR REPLACE FUNCTION public.enforce_line_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if tg_op = 'INSERT' then
    if new.approval_status <> 'pending' and not public.is_owner() then
      new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null;
    end if;
    return new;
  end if;
  if new.approval_status is distinct from old.approval_status then
    if not public.is_owner() then
      raise exception 'Only owners can approve order lines.' using errcode = '42501';
    end if;
    new.approved_by := case when new.approval_status = 'pending' then null else auth.uid() end;
    new.approved_at := case when new.approval_status = 'pending' then null else now() end;
  elsif not public.is_owner() and old.approval_status <> 'pending'
        and (new.current_quantity is distinct from old.current_quantity or new.negotiated_price is distinct from old.negotiated_price) then
    -- a changed line needs fresh approval
    new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end; $$;

CREATE TRIGGER order_lines_approval
BEFORE INSERT OR UPDATE ON public.order_lines
FOR EACH ROW EXECUTE FUNCTION public.enforce_line_approval();