import "server-only";

import { neon } from "@neondatabase/serverless";

const usageTypes = ["CLASS", "NON_CLASS"] as const;
const nonClassTypes = ["TRIAL_PRINT", "SAMPLE"] as const;
const completionResults = ["SUCCESS", "PARTIAL", "FAILED", "CANCELLED"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UsageCompletionInput = {
  result: (typeof completionResults)[number];
  notes: string;
  items: Array<{ inventoryItemId: string; barcode: string; usedGrams: number }>;
};

type UsageType = (typeof usageTypes)[number];
type NonClassType = (typeof nonClassTypes)[number];

export type UsageInput = {
  userName: string;
  usageType: UsageType;
  nonClassType: NonClassType | null;
  inventoryItemIds: string[];
};

type UsageRow = {
  id: string;
  usage_number: string;
  user_name: string;
  usage_type: UsageType;
  non_class_type: NonClassType | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  started_at: string | Date;
  completed_at: string | Date | null;
  unit_count: string | number;
  total_starting_grams: string | number;
  total_used_grams: string | number;
  total_returned_grams: string | number;
  result: UsageCompletionInput["result"] | null;
  notes: string;
};

type UsageItemRow = {
  inventory_item_id: string;
  code: string;
  product: string;
  material: string;
  color: string;
  status: string;
  remaining_grams: string | number;
  starting_grams: string | number;
  used_grams: string | number | null;
  returned_grams: string | number | null;
};

let usageSchemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(databaseUrl);
}

export async function ensureUsageSchema() {
  if (!usageSchemaReady) {
    usageSchemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists inventory_items (
          id uuid primary key,
          code text not null unique,
          product text not null,
          material text not null,
          color text not null,
          packaging_type text not null check (packaging_type in ('WITH_SPOOL', 'REFILL')),
          remaining_grams numeric(12,2) not null check (remaining_grams >= 0),
          status text not null check (status in ('AVAILABLE', 'IN_USE', 'LOW_STOCK', 'EMPTY', 'DAMAGED', 'INACTIVE')),
          unit_cost numeric(16,2) not null check (unit_cost >= 0),
          supplier text not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists usage_sessions (
          id uuid primary key,
          usage_number text not null unique,
          user_name text not null,
          usage_type text not null check (usage_type in ('CLASS', 'NON_CLASS')),
          non_class_type text check (non_class_type in ('TRIAL_PRINT', 'SAMPLE')),
          status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
          started_at timestamptz not null default now(),
          completed_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          check ((usage_type = 'CLASS' and non_class_type is null) or (usage_type = 'NON_CLASS' and non_class_type is not null))
        )
      `;
      await sql`
        create table if not exists usage_session_items (
          session_id uuid not null references usage_sessions(id) on delete cascade,
          inventory_item_id uuid not null references inventory_items(id) on delete restrict,
          starting_grams numeric(12,2) not null check (starting_grams >= 0),
          returned_grams numeric(12,2),
          used_grams numeric(12,2),
          primary key (session_id, inventory_item_id)
        )
      `;
      await sql`create index if not exists usage_sessions_status_started_idx on usage_sessions (status, started_at desc)`;
      await sql`create index if not exists usage_session_items_inventory_idx on usage_session_items (inventory_item_id)`;
      await sql`alter table usage_sessions add column if not exists result text check (result in ('SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED'))`;
      await sql`alter table usage_sessions add column if not exists notes text not null default ''`;
    })().catch((error) => {
      usageSchemaReady = null;
      throw error;
    });
  }
  await usageSchemaReady;
}

function mapUsage(row: UsageRow) {
  return {
    id: row.id,
    number: row.usage_number,
    userName: row.user_name,
    usageType: row.usage_type,
    nonClassType: row.non_class_type,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    unitCount: Number(row.unit_count),
    totalStartingGrams: Number(row.total_starting_grams),
    totalUsedGrams: Number(row.total_used_grams),
    totalReturnedGrams: Number(row.total_returned_grams),
    result: row.result,
    notes: row.notes,
  };
}

export function parseUsageInput(value: unknown): UsageInput {
  if (!value || typeof value !== "object") throw new Error("Data penggunaan tidak valid.");
  const input = value as Record<string, unknown>;
  const userName = String(input.userName ?? "").trim();
  const usageType = String(input.usageType ?? "") as UsageType;
  const nonClassType = usageType === "NON_CLASS" ? String(input.nonClassType ?? "") as NonClassType : null;
  const inventoryItemIds = Array.isArray(input.inventoryItemIds)
    ? input.inventoryItemIds.map((id) => String(id).trim())
    : [];

  if (userName.length < 2 || userName.length > 120) throw new Error("Nama pengambil wajib diisi, 2–120 karakter.");
  if (!usageTypes.includes(usageType)) throw new Error("Jenis penggunaan tidak valid.");
  if (usageType === "NON_CLASS" && (!nonClassType || !nonClassTypes.includes(nonClassType))) throw new Error("Pilih jenis Nonkelas: Trial Print atau Sample.");
  if (!inventoryItemIds.length || inventoryItemIds.length > 20) throw new Error("Scan 1–20 unit filamen sebelum konfirmasi.");
  if (new Set(inventoryItemIds).size !== inventoryItemIds.length) throw new Error("Unit filamen tidak boleh dipilih dua kali.");
  if (inventoryItemIds.some((id) => !uuidPattern.test(id))) {
    throw new Error("Identitas unit filamen tidak valid.");
  }

  return { userName, usageType, nonClassType, inventoryItemIds };
}

export function parseUsageCompletionInput(value: unknown): UsageCompletionInput {
  if (!value || typeof value !== "object") throw new Error("Data penyelesaian tidak valid.");
  const input = value as Record<string, unknown>;
  const result = String(input.result ?? "") as UsageCompletionInput["result"];
  const notes = String(input.notes ?? "").trim();
  if (!completionResults.includes(result)) throw new Error("Pilih hasil pekerjaan yang valid.");
  if (notes.length > 1000) throw new Error("Catatan maksimal 1.000 karakter.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error("Seluruh unit pada sesi harus diisi dan di-scan ulang.");
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Data unit tidak valid.");
    const item = raw as Record<string, unknown>;
    const inventoryItemId = String(item.inventoryItemId ?? "").trim().toLowerCase();
    const barcode = String(item.barcode ?? "").trim().toUpperCase();
    const usedGrams = item.usedGrams;
    if (!uuidPattern.test(inventoryItemId)) throw new Error("Identitas unit tidak valid.");
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(barcode)) throw new Error("Scan ulang barcode setiap unit sebelum finalisasi.");
    if (typeof usedGrams !== "number" || !Number.isFinite(usedGrams) || usedGrams < 0 || usedGrams > 100000 || Math.abs(usedGrams * 100 - Math.round(usedGrams * 100)) > 0.000001) {
      throw new Error("Gram digunakan wajib berupa angka 0–100.000, maksimal 2 angka desimal.");
    }
    return { inventoryItemId, barcode, usedGrams };
  });
  if (new Set(items.map((item) => item.inventoryItemId)).size !== items.length) throw new Error("Unit tidak boleh dikirim dua kali.");
  return { result, notes, items };
}

function usageNumber(id: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `USE-${value("year")}${value("month")}${value("day")}-${id.slice(0, 6).toUpperCase()}`;
}

function usageQuery(id?: string) {
  const sql = getSql();
  return id
    ? sql`
        select s.*, count(i.inventory_item_id)::int as unit_count,
          coalesce(sum(i.starting_grams), 0) as total_starting_grams,
          coalesce(sum(i.used_grams), 0) as total_used_grams,
          coalesce(sum(i.returned_grams), 0) as total_returned_grams
        from usage_sessions s
        left join usage_session_items i on i.session_id = s.id
        where s.id = ${id}
        group by s.id
      `
    : sql`
        select s.*, count(i.inventory_item_id)::int as unit_count,
          coalesce(sum(i.starting_grams), 0) as total_starting_grams,
          coalesce(sum(i.used_grams), 0) as total_used_grams,
          coalesce(sum(i.returned_grams), 0) as total_returned_grams
        from usage_sessions s
        left join usage_session_items i on i.session_id = s.id
        where s.status = 'ACTIVE'
        group by s.id
        order by s.started_at desc
      `;
}

export async function listActiveUsageSessions() {
  await ensureUsageSchema();
  const rows = await usageQuery();
  return (rows as UsageRow[]).map(mapUsage);
}

export async function getUsageSession(id: string) {
  if (!uuidPattern.test(id)) throw new Error("Nomor sesi tidak valid.");
  await ensureUsageSchema();
  const rows = await usageQuery(id);
  if (!rows[0]) return null;
  const sql = getSql();
  const itemRows = await sql`
    select item.*, inv.code, inv.product, inv.material, inv.color, inv.status, inv.remaining_grams
    from usage_session_items item join inventory_items inv on inv.id = item.inventory_item_id
    where item.session_id = ${id} order by inv.code
  `;
  return {
    ...mapUsage(rows[0] as UsageRow),
    items: (itemRows as UsageItemRow[]).map((item) => ({
      inventoryItemId: item.inventory_item_id,
      code: item.code,
      product: item.product,
      material: item.material,
      color: item.color,
      currentStatus: item.status,
      currentGrams: Number(item.remaining_grams),
      startingGrams: Number(item.starting_grams),
      usedGrams: item.used_grams === null ? null : Number(item.used_grams),
      returnedGrams: item.returned_grams === null ? null : Number(item.returned_grams),
    })),
  };
}

export async function findActiveUsageByBarcode(barcode: string) {
  const code = barcode.trim().toUpperCase();
  if (!code || code.length > 40) throw new Error("Masukkan barcode unit yang valid.");
  await ensureUsageSchema();
  const sql = getSql();
  const rows = await sql`
    select s.id from usage_sessions s
    join usage_session_items item on item.session_id = s.id
    join inventory_items inv on inv.id = item.inventory_item_id
    where s.status = 'ACTIVE' and inv.code = ${code}
    limit 2
  `;
  if (rows.length > 1) throw new Error("Unit terkait lebih dari satu sesi aktif. Periksa data sesi sebelum melanjutkan.");
  return rows[0] ? getUsageSession(String(rows[0].id)) : null;
}

export async function createUsageSession(input: UsageInput) {
  await ensureUsageSchema();
  const sql = getSql();
  const id = crypto.randomUUID();
  const number = usageNumber(id);
  const requestedIds = JSON.stringify(input.inventoryItemIds);
  const rows = await sql`
    with requested as (
      select value::uuid as id
      from jsonb_array_elements_text(${requestedIds}::jsonb)
    ), eligible as (
      select inv.id, inv.remaining_grams
      from inventory_items inv
      join requested req on req.id = inv.id
      where inv.status in ('AVAILABLE', 'LOW_STOCK')
        and not exists (
          select 1 from usage_session_items item join usage_sessions s on s.id = item.session_id
          where item.inventory_item_id = inv.id and s.status = 'ACTIVE'
        )
      order by inv.id
      for update
    ), new_session as (
      insert into usage_sessions (id, usage_number, user_name, usage_type, non_class_type)
      select ${id}, ${number}, ${input.userName}, ${input.usageType}, ${input.nonClassType}
      where (select count(*) from eligible) = ${input.inventoryItemIds.length}
      returning id
    ), session_items as (
      insert into usage_session_items (session_id, inventory_item_id, starting_grams)
      select new_session.id, eligible.id, eligible.remaining_grams
      from new_session cross join eligible
      returning inventory_item_id
    ), updated_inventory as (
      update inventory_items inv
      set status = 'IN_USE', updated_at = now()
      from session_items item
      where inv.id = item.inventory_item_id
      returning inv.id
    )
    select id from new_session
  `;
  if (!rows[0]) throw new Error("UNIT_NOT_AVAILABLE");
  return getUsageSession(id);
}

export async function completeUsageSession(id: string, input: UsageCompletionInput) {
  const existing = await getUsageSession(id);
  if (!existing) throw new Error("USAGE_NOT_FOUND");
  if (existing.status !== "ACTIVE") throw new Error("USAGE_ALREADY_COMPLETED");
  const sql = getSql();
  const requestedItems = JSON.stringify(input.items.map((item) => ({
    inventory_item_id: item.inventoryItemId,
    barcode: item.barcode,
    used_grams: item.usedGrams,
  })));

  // Lock the session and inventory, validate the complete set, then write all changes in one statement.
  const rows = await sql`
    with requested as (
      select * from jsonb_to_recordset(${requestedItems}::jsonb)
      as req(inventory_item_id uuid, barcode text, used_grams numeric)
    ), target as (
      select id from usage_sessions where id = ${id} and status = 'ACTIVE' for update
    ), locked_inventory as (
      select inv.id, inv.code, inv.status, inv.remaining_grams, item.starting_grams
      from inventory_items inv
      join usage_session_items item on item.inventory_item_id = inv.id
      join target on target.id = item.session_id
      order by inv.id
      for update of inv
    ), eligible as (
      select inv.id, inv.remaining_grams, req.used_grams
      from locked_inventory inv join requested req on req.inventory_item_id = inv.id
      where req.barcode = inv.code and inv.status = 'IN_USE'
        and inv.remaining_grams = inv.starting_grams
        and req.used_grams >= 0 and req.used_grams <= inv.remaining_grams
        and not exists (
          select 1 from usage_session_items other_item join usage_sessions other_session on other_session.id = other_item.session_id
          where other_item.inventory_item_id = inv.id and other_session.status = 'ACTIVE' and other_session.id <> ${id}
        )
    ), ready as (
      select id from target
      where (select count(*) from locked_inventory) = ${input.items.length}
        and (select count(*) from eligible) = ${input.items.length}
    ), updated_inventory as (
      update inventory_items inv
      set remaining_grams = eligible.remaining_grams - eligible.used_grams,
        status = case
          when eligible.remaining_grams - eligible.used_grams = 0 then 'EMPTY'
          when eligible.remaining_grams - eligible.used_grams < 500 then 'LOW_STOCK'
          else 'AVAILABLE'
        end,
        updated_at = now()
      from eligible, ready where inv.id = eligible.id
      returning inv.id, inv.remaining_grams
    ), updated_items as (
      update usage_session_items item
      set used_grams = req.used_grams, returned_grams = inv.remaining_grams
      from requested req, updated_inventory inv, ready
      where item.session_id = ready.id and item.inventory_item_id = inv.id and req.inventory_item_id = inv.id
      returning item.inventory_item_id
    ), completed as (
      update usage_sessions s
      set status = 'COMPLETED', result = ${input.result}, notes = ${input.notes}, completed_at = now(), updated_at = now()
      from ready where s.id = ready.id and (select count(*) from updated_items) = ${input.items.length}
      returning s.id
    )
    select id from completed
  `;
  if (!rows[0]) throw new Error("USAGE_COMPLETION_CONFLICT");
  return getUsageSession(id);
}
