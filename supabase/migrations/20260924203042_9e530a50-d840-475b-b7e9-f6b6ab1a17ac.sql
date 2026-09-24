
-- ============ roles ============
create type public.app_role as enum ('staff','customer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'staff')
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "staff manage roles" on public.user_roles for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ============ shared helpers ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  contact_name text,
  phone text,
  company_name text,
  company_details text,
  shipping_country text,
  shipping_destination text,
  shipping_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid() or public.is_staff());
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, contact_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'contact_name', new.raw_user_meta_data->>'full_name'))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer')
  on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ catalog ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.categories to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories readable" on public.categories for select to authenticated using (true);
create policy "staff manage categories" on public.categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  image_path text,
  carton_length numeric(10,2),
  carton_width numeric(10,2),
  carton_height numeric(10,2),
  cbm_per_carton numeric(12,4) not null check (cbm_per_carton > 0),
  default_price numeric(12,2) not null check (default_price >= 0),
  unit text not null default 'Carton',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products readable" on public.products for select to authenticated using (true);
create policy "staff manage products" on public.products for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.container_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  capacity_cbm numeric(12,3) not null check (capacity_cbm > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.container_types to authenticated;
grant all on public.container_types to service_role;
alter table public.container_types enable row level security;
create policy "containers readable" on public.container_types for select to authenticated using (true);
create policy "staff manage containers" on public.container_types for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create trigger container_types_updated_at before update on public.container_types
  for each row execute function public.set_updated_at();

insert into public.container_types (code, name, capacity_cbm) values
  ('20FT','20 FT Container',33.000),
  ('40FT','40 FT Container',67.000);

-- ============ settings ============
create table public.app_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Sky Plus',
  whatsapp_number text,
  viber_number text,
  contact_email text,
  address text,
  currency text not null default 'USD',
  payment_instructions text,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "settings readable" on public.app_settings for select to authenticated using (true);
create policy "staff manage settings" on public.app_settings for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
insert into public.app_settings (id) values (true);

-- ============ orders ============
create type public.order_status as enum
  ('draft','submitted','under_review','awaiting_customer','customer_updated','confirmed','loading','shipped','completed');

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SO-' || nextval('public.order_number_seq')::text),
  customer_id uuid not null references auth.users(id) on delete cascade,
  container_type_id uuid not null references public.container_types(id),
  container_capacity_cbm numeric(12,3) not null,
  status public.order_status not null default 'draft',
  is_locked boolean not null default false,
  notes text,
  advance_percent numeric(6,3),
  advance_amount numeric(14,2),
  finalized_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders(customer_id);
create index orders_status_idx on public.orders(status);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders visible to owner or staff" on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy "customer creates own order" on public.orders for insert to authenticated
  with check (customer_id = auth.uid() or public.is_staff());
create policy "owner or staff update order" on public.orders for update to authenticated
  using ((customer_id = auth.uid() and not is_locked) or public.is_staff())
  with check (customer_id = auth.uid() or public.is_staff());
create policy "staff delete order" on public.orders for delete to authenticated using (public.is_staff());
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name text not null,
  category_name text,
  image_path text,
  unit text not null default 'Carton',
  cbm_per_carton numeric(12,4) not null,
  catalog_price numeric(12,2) not null,
  negotiated_price numeric(12,2) not null,
  requested_quantity integer not null default 0 check (requested_quantity >= 0),
  proposed_quantity integer check (proposed_quantity >= 0),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  final_quantity integer check (final_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, sku)
);
create index order_lines_order_idx on public.order_lines(order_id);
grant select, insert, update, delete on public.order_lines to authenticated;
grant all on public.order_lines to service_role;
alter table public.order_lines enable row level security;
create policy "lines visible to owner or staff" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "owner or staff write lines" on public.order_lines for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and ((o.customer_id = auth.uid() and not o.is_locked) or public.is_staff())))
  with check (exists (select 1 from public.orders o where o.id = order_id and ((o.customer_id = auth.uid() and not o.is_locked) or public.is_staff())));
create trigger order_lines_updated_at before update on public.order_lines
  for each row execute function public.set_updated_at();

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  sku text,
  product_name text,
  previous_quantity integer,
  new_quantity integer,
  previous_price numeric(12,2),
  new_price numeric(12,2),
  previous_status text,
  new_status text,
  reason text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at desc);
grant select, insert on public.order_events to authenticated;
grant all on public.order_events to service_role;
alter table public.order_events enable row level security;
create policy "events visible to owner or staff" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "participants insert events" on public.order_events for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));

-- ============ invoices ============
create type public.invoice_kind as enum ('proforma','commercial');
create type public.invoice_state as enum ('current','superseded','cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  kind public.invoice_kind not null,
  invoice_number text not null,
  version integer not null default 1,
  state public.invoice_state not null default 'current',
  issue_date date not null default current_date,
  container_code text,
  total_cbm numeric(14,4) not null default 0,
  container_capacity_cbm numeric(12,3),
  total_value numeric(14,2) not null default 0,
  advance_percent numeric(6,3),
  advance_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  payment_instructions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (invoice_number, version)
);
create index invoices_order_idx on public.invoices(order_id);
grant select, insert, update on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
create policy "invoices visible to owner or staff" on public.invoices for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy "staff create invoices" on public.invoices for insert to authenticated with check (public.is_staff());
create policy "staff update invoices" on public.invoices for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  sku text not null,
  product_name text not null,
  unit text,
  quantity integer not null,
  price numeric(12,2) not null,
  cbm_per_carton numeric(12,4) not null,
  total_cbm numeric(14,4) not null,
  subtotal numeric(14,2) not null
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);
grant select, insert on public.invoice_lines to authenticated;
grant all on public.invoice_lines to service_role;
alter table public.invoice_lines enable row level security;
create policy "invoice lines visible" on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and (i.customer_id = auth.uid() or public.is_staff())));
create policy "staff insert invoice lines" on public.invoice_lines for insert to authenticated
  with check (public.is_staff());

-- ============ payments ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text,
  reference text,
  notes text,
  status text not null default 'confirmed',
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);
grant select, insert, update on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "payments visible to owner or staff" on public.payments for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy "staff record payments" on public.payments for insert to authenticated with check (public.is_staff());
create policy "staff update payments" on public.payments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ============ notifications ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "insert notifications" on public.notifications for insert to authenticated
  with check (public.is_staff() or user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ audit ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "staff read audit" on public.audit_log for select to authenticated using (public.is_staff());
create policy "authenticated insert audit" on public.audit_log for insert to authenticated with check (auth.uid() is not null);
