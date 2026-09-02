import "server-only";

import { neon } from "@neondatabase/serverless";

const usageTypes = ["CLASS", "NON_CLASS"] as const;
const nonClassTypes = ["TRIAL_PRINT", "SAMPLE"] as const;

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
};

let usageSchemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(databaseUrl);
}

async function ensureUsageSchema() {
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
  if (inventoryItemIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("Identitas unit filamen tidak valid.");
  }

  return { userName, usageType, nonClassType, inventoryItemIds };
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
          coalesce(sum(i.starting_grams), 0) as total_starting_grams
        from usage_sessions s
        left join usage_session_items i on i.session_id = s.id
        where s.id = ${id}
        group by s.id
      `
    : sql`
        select s.*, count(i.inventory_item_id)::int as unit_count,
          coalesce(sum(i.starting_grams), 0) as total_starting_grams
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
  await ensureUsageSchema();
  const rows = await usageQuery(id);
  return rows[0] ? mapUsage(rows[0] as UsageRow) : null;
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

