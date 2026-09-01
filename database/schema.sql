-- TIDIGO ERP Stok Filamen
-- PostgreSQL 15+; kompatibel dengan Neon, Supabase, dan PostgreSQL terkelola lain.

create extension if not exists pgcrypto;

create type erp_role as enum ('OPERATOR', 'ADMIN_INVENTORY', 'SUPERVISOR', 'SUPER_ADMIN');
create type packaging_type as enum ('WITH_SPOOL', 'REFILL');
create type filament_unit_status as enum ('AVAILABLE', 'LOW_STOCK', 'IN_USE', 'EMPTY', 'DAMAGED', 'INACTIVE');
create type receipt_status as enum ('DRAFT', 'FINALIZED', 'CANCELLED');
create type usage_type as enum ('CLASS', 'NON_CLASS');
create type non_class_category as enum ('TRIAL_PRINT', 'SAMPLE');
create type usage_status as enum ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
create type usage_result as enum ('SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED');
create type inventory_transaction_type as enum ('RECEIPT', 'USAGE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUBTRACT', 'REVERSAL', 'MARK_DAMAGED', 'DEACTIVATION');
create type adjustment_status as enum ('DRAFT', 'FINALIZED', 'REVERSED');

create table users (
  id uuid primary key default gen_random_uuid(),
  mls_user_id text not null unique,
  full_name text not null,
  email text not null,
  account_type text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_users_email_lower on users (lower(email));
create index idx_users_account_active on users (account_type, is_active);

create table user_roles (
  user_id uuid not null references users(id),
  role erp_role not null,
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table filament_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table filament_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table filament_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hex_color char(7),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_filament_colors_hex check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (name, hex_color)
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null,
  storage_key text not null unique,
  original_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  is_private boolean not null default true,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table filament_products (
  id uuid primary key default gen_random_uuid(),
  product_barcode text not null unique,
  brand_id uuid not null references filament_brands(id),
  product_name text not null,
  material_id uuid not null references filament_materials(id),
  color_id uuid not null references filament_colors(id),
  diameter_mm numeric(4,2) not null default 1.75 check (diameter_mm > 0),
  nominal_weight_g numeric(12,2) not null default 1000 check (nominal_weight_g = 1000),
  packaging_type packaging_type not null,
  photo_attachment_id uuid references attachments(id),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_filament_products_master on filament_products (brand_id, material_id, color_id, packaging_type);
create index idx_filament_products_active on filament_products (is_active) where is_active = true;

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  invoice_number text not null,
  purchase_date date not null,
  received_date date not null,
  subtotal numeric(16,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(16,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  shipping_amount numeric(16,2) not null default 0 check (shipping_amount >= 0),
  landed_cost_total numeric(16,2) not null default 0 check (landed_cost_total >= 0),
  status receipt_status not null default 'DRAFT',
  notes text,
  created_by uuid not null references users(id),
  finalized_by uuid references users(id),
  finalized_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goods_receipts_dates check (received_date >= purchase_date),
  constraint chk_goods_receipts_finalize check (
    (status = 'FINALIZED' and finalized_by is not null and finalized_at is not null)
    or status <> 'FINALIZED'
  )
);

create unique index uq_goods_receipts_supplier_invoice on goods_receipts (supplier_id, lower(invoice_number));
create index idx_goods_receipts_received_status on goods_receipts (received_date desc, status);

create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id),
  product_id uuid not null references filament_products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(16,2) not null check (unit_price >= 0),
  line_subtotal numeric(16,2) not null check (line_subtotal >= 0),
  allocated_discount numeric(16,2) not null default 0 check (allocated_discount >= 0),
  allocated_tax numeric(16,2) not null default 0 check (allocated_tax >= 0),
  allocated_shipping numeric(16,2) not null default 0 check (allocated_shipping >= 0),
  landed_cost_total numeric(16,2) not null check (landed_cost_total >= 0),
  landed_cost_per_unit numeric(16,2) not null check (landed_cost_per_unit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goods_receipt_id, product_id)
);

create index idx_goods_receipt_items_receipt on goods_receipt_items (goods_receipt_id);

create table filament_units (
  id uuid primary key default gen_random_uuid(),
  internal_barcode text not null unique,
  product_id uuid not null references filament_products(id),
  goods_receipt_item_id uuid not null references goods_receipt_items(id),
  location_id uuid not null references locations(id),
  initial_weight_g numeric(12,2) not null default 1000 check (initial_weight_g = 1000),
  remaining_weight_g numeric(12,2) not null default 1000 check (remaining_weight_g >= 0),
  unit_cost numeric(16,2) not null check (unit_cost >= 0),
  cost_per_gram numeric(16,6) not null check (cost_per_gram >= 0),
  status filament_unit_status not null default 'AVAILABLE',
  active_usage_item_id uuid,
  received_at timestamptz not null,
  deactivated_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_filament_unit_balance check (remaining_weight_g <= initial_weight_g),
  constraint chk_filament_unit_status_balance check (
    (remaining_weight_g = 0 and status in ('EMPTY', 'DAMAGED', 'INACTIVE'))
    or (remaining_weight_g > 0 and status <> 'EMPTY')
  )
);

create unique index uq_filament_units_active_usage on filament_units (active_usage_item_id) where active_usage_item_id is not null;
create index idx_filament_units_product_status on filament_units (product_id, status);
create index idx_filament_units_attention on filament_units (remaining_weight_g, status) where remaining_weight_g < 500 and remaining_weight_g > 0;
create index idx_filament_units_location_status on filament_units (location_id, status);

create table usage_sessions (
  id uuid primary key default gen_random_uuid(),
  usage_number text not null unique,
  taken_by_user_id uuid not null references users(id),
  usage_type usage_type not null,
  non_class_category non_class_category,
  status usage_status not null default 'DRAFT',
  result usage_result,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references users(id),
  total_used_g numeric(14,2) not null default 0 check (total_used_g >= 0),
  total_cost numeric(16,2) not null default 0 check (total_cost >= 0),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_usage_category check (
    (usage_type = 'CLASS' and non_class_category is null)
    or (usage_type = 'NON_CLASS' and non_class_category is not null)
  ),
  constraint chk_usage_completion check (
    (status = 'COMPLETED' and completed_at is not null and completed_by is not null and result is not null)
    or status <> 'COMPLETED'
  ),
  constraint chk_failed_usage_reason check (result <> 'FAILED' or nullif(trim(notes), '') is not null)
);

create index idx_usage_sessions_active on usage_sessions (status, started_at) where status = 'ACTIVE';
create index idx_usage_sessions_user_period on usage_sessions (taken_by_user_id, started_at desc);
create index idx_usage_sessions_reporting on usage_sessions (started_at desc, usage_type, non_class_category, result);

create table usage_items (
  id uuid primary key default gen_random_uuid(),
  usage_session_id uuid not null references usage_sessions(id),
  filament_unit_id uuid not null references filament_units(id),
  slicer_slot integer check (slicer_slot is null or slicer_slot > 0),
  remaining_before_g numeric(12,2) not null check (remaining_before_g >= 0),
  used_weight_g numeric(12,2) check (used_weight_g is null or used_weight_g >= 0),
  remaining_after_g numeric(12,2) check (remaining_after_g is null or remaining_after_g >= 0),
  cost_per_gram_snapshot numeric(16,6) not null check (cost_per_gram_snapshot >= 0),
  usage_cost numeric(16,2) check (usage_cost is null or usage_cost >= 0),
  checked_out_at timestamptz not null default now(),
  checked_in_at timestamptz,
  is_return_scanned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usage_session_id, filament_unit_id),
  constraint chk_usage_item_balance check (
    (used_weight_g is null and remaining_after_g is null)
    or (used_weight_g is not null and remaining_after_g = remaining_before_g - used_weight_g and used_weight_g <= remaining_before_g)
  ),
  constraint chk_usage_item_scan check (is_return_scanned = false or checked_in_at is not null)
);

alter table filament_units
  add constraint fk_filament_units_active_usage_item
  foreign key (active_usage_item_id) references usage_items(id);

create index idx_usage_items_session on usage_items (usage_session_id);
create index idx_usage_items_active_unit on usage_items (filament_unit_id, checked_in_at) where checked_in_at is null;

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_number text not null unique,
  status adjustment_status not null default 'DRAFT',
  reason text not null check (length(trim(reason)) >= 5),
  created_by uuid not null references users(id),
  finalized_by uuid references users(id),
  finalized_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references stock_adjustments(id),
  filament_unit_id uuid not null references filament_units(id),
  quantity_change_g numeric(12,2) not null check (quantity_change_g <> 0),
  balance_before_g numeric(12,2) not null check (balance_before_g >= 0),
  balance_after_g numeric(12,2) not null check (balance_after_g >= 0),
  created_at timestamptz not null default now(),
  unique (stock_adjustment_id, filament_unit_id),
  constraint chk_adjustment_math check (balance_after_g = balance_before_g + quantity_change_g)
);

create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  filament_unit_id uuid not null references filament_units(id),
  transaction_type inventory_transaction_type not null,
  reference_type text not null,
  reference_id uuid not null,
  quantity_change_g numeric(12,2) not null check (quantity_change_g <> 0),
  balance_before_g numeric(12,2) not null check (balance_before_g >= 0),
  balance_after_g numeric(12,2) not null check (balance_after_g >= 0),
  unit_cost_snapshot numeric(16,2) not null check (unit_cost_snapshot >= 0),
  total_value_change numeric(16,2) not null,
  reason text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint chk_inventory_transaction_math check (balance_after_g = balance_before_g + quantity_change_g),
  unique (reference_type, reference_id, filament_unit_id, transaction_type)
);

create index idx_inventory_transactions_unit_time on inventory_transactions (filament_unit_id, created_at desc);
create index idx_inventory_transactions_reference on inventory_transactions (reference_type, reference_id);
create index idx_inventory_transactions_reporting on inventory_transactions (created_at desc, transaction_type);

create table entity_attachments (
  attachment_id uuid primary key references attachments(id),
  entity_type text not null,
  entity_id uuid not null,
  purpose text not null,
  created_at timestamptz not null default now()
);

create index idx_entity_attachments_entity on entity_attachments (entity_type, entity_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id, created_at desc);
create index idx_audit_logs_user_time on audit_logs (user_id, created_at desc);
create index idx_audit_logs_action_time on audit_logs (action, created_at desc);

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table idempotency_records (
  scope text not null,
  key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, key)
);

create index idx_idempotency_records_expiry on idempotency_records (expires_at);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users', 'locations', 'suppliers', 'filament_brands', 'filament_materials',
    'filament_colors', 'filament_products', 'goods_receipts', 'goods_receipt_items',
    'filament_units', 'usage_sessions', 'usage_items', 'stock_adjustments'
  ]
  loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into locations (code, name) values ('MAIN', 'Gudang Filamen Utama') on conflict do nothing;
insert into filament_materials (code, name) values
  ('PLA', 'PLA'), ('PETG', 'PETG'), ('TPU', 'TPU'), ('ABS', 'ABS')
on conflict do nothing;
insert into system_settings (key, value) values
  ('inventory.low_stock_threshold_g', '500'::jsonb),
  ('inventory.nominal_weight_g', '1000'::jsonb),
  ('labels.barcode_type', '"CODE128"'::jsonb),
  ('locale.timezone', '"Asia/Jakarta"'::jsonb)
on conflict do nothing;

-- Finalisasi receipt, usage, dan adjustment harus dijalankan di transaksi backend.
-- Lock baris filament_units dengan SELECT ... FOR UPDATE, cek version/status,
-- tulis inventory_transactions, lalu perbarui saldo/status sebelum COMMIT.
-- Jangan pernah UPDATE atau DELETE baris inventory_transactions dan audit_logs.

