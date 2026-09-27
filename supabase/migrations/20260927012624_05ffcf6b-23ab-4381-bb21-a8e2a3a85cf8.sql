create table public.customer_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  email text not null,
  contact_name text,
  company_name text,
  role app_role not null default 'customer',
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index customer_invites_email_idx on public.customer_invites (lower(email));

grant select, insert, update on public.customer_invites to authenticated;
grant all on public.customer_invites to service_role;

alter table public.customer_invites enable row level security;

create policy "staff manage invites" on public.customer_invites
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "invitee reads own invite" on public.customer_invites
  for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite public.customer_invites%rowtype;
  v_role app_role;
  v_has_staff boolean;
begin
  select exists (select 1 from public.user_roles where role = 'staff') into v_has_staff;

  if not v_has_staff then
    v_role := 'staff';
  else
    select * into v_invite
    from public.customer_invites
    where lower(email) = lower(new.email)
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;

    if v_invite.id is null then
      raise exception 'Sign-up is by invitation only. Please ask Sky Plus for an invite link.'
        using errcode = '42501';
    end if;

    v_role := v_invite.role;

    update public.customer_invites
      set accepted_at = now(), accepted_by = new.id
      where id = v_invite.id;
  end if;

  insert into public.profiles (id, email, contact_name, company_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'contact_name', new.raw_user_meta_data->>'full_name', v_invite.contact_name),
    v_invite.company_name
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, v_role)
  on conflict do nothing;

  return new;
end; $function$;