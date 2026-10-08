UPDATE public.user_roles SET role = 'owner' WHERE role = 'staff';

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('staff','owner','admin')) $$;

CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'owner') $$;

CREATE OR REPLACE FUNCTION public.enforce_owner_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if new.role = 'owner' and (select count(*) from public.user_roles where role = 'owner' and user_id <> new.user_id) >= 2 then
    raise exception 'A workspace can have at most 2 owners.' using errcode = '42501';
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS user_roles_owner_limit ON public.user_roles;
CREATE TRIGGER user_roles_owner_limit BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_limit();

CREATE OR REPLACE FUNCTION public.enforce_invite_role()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if new.role in ('owner','admin','staff') and not public.is_owner() then
    raise exception 'Only owners can invite owners or admins.' using errcode = '42501';
  end if;
  if new.role = 'owner' and (select count(*) from public.user_roles where role = 'owner') >= 2 then
    raise exception 'A workspace can have at most 2 owners.' using errcode = '42501';
  end if;
  return new;
end; $$;
DROP TRIGGER IF EXISTS customer_invites_role_check ON public.customer_invites;
CREATE TRIGGER customer_invites_role_check BEFORE INSERT OR UPDATE OF role ON public.customer_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_role();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_invite public.customer_invites%rowtype;
  v_role app_role;
  v_has_owner boolean;
begin
  select exists (select 1 from public.user_roles where role in ('owner','staff','admin')) into v_has_owner;
  if not v_has_owner then
    v_role := 'owner';
  else
    select * into v_invite from public.customer_invites
    where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null and expires_at > now()
    order by created_at desc limit 1;
    if v_invite.id is null then
      raise exception 'This Google account has not been invited to this Sky Plus workspace. Please contact your administrator.'
        using errcode = '42501';
    end if;
    v_role := v_invite.role;
    update public.customer_invites set accepted_at = now(), accepted_by = new.id where id = v_invite.id;
  end if;

  insert into public.profiles (id, email, contact_name, company_name)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'contact_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', v_invite.contact_name),
    v_invite.company_name)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, v_role) on conflict do nothing;
  return new;
end; $function$;