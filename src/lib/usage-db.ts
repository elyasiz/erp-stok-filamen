import "server-only";

import { neon } from "@neondatabase/serverless";
import { isStaff, type Actor } from "./account-types";
import { ensureAuditSchema } from "./audit-db";

const usageTypes = ["CLASS", "NON_CLASS"] as const;
const nonClassTypes = ["TRIAL_PRINT", "SAMPLE"] as const;
const completionResults = ["SUCCESS", "PARTIAL", "FAILED", "CANCELLED"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UsageCompletionInput = {
  result: (typeof completionResults)[number];
  measurementMode: "MEASURED" | "UNKNOWN";
  notes: string;
  items: Array<{ inventoryItemId: string; barcode: string; usedGrams: number }>;
};

export type UsageCorrectionInput = {
  reason: string;
  items: Array<{ inventoryItemId: string; usedGrams: number }>;
};

export type UsageCorrectionReviewInput = {
  decision: "APPROVE" | "REJECT";
  note: string;
};

export type UsageWeighingInput = {
  note: string;
  items: Array<{ inventoryItemId: string; remainingGrams: number }>;
};

type UsageType = (typeof usageTypes)[number];
type NonClassType = (typeof nonClassTypes)[number];

export type UsageInput = {
  userName: string;
  usageType: UsageType;
  nonClassType: NonClassType | null;
  inventoryItemIds: string[];
  activityName?: string;
  borrowerUserId?: string;
};

type UsageRow = {
  id: string;
  usage_number: string;
  user_name: string;
  borrower_user_id: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  completed_by_name: string | null;
  activity_name: string;
  usage_type: UsageType;
  non_class_type: NonClassType | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  started_at: string | Date;
  completed_at: string | Date | null;
  unit_count: string | number;
  total_starting_grams: string | number;
  total_used_grams: string | number;
  total_returned_grams: string | number;
  pending_measurement_count: string | number;
  colors: string[];
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
  measurement_status: "MEASURED" | "PENDING";
  provisional_used_grams: string | number | null;
  weighed_by_name: string | null;
  weighed_at: string | Date | null;
  weighing_note: string;
};

type UsageWeighingRow = {
  id: string;
  usage_number: string;
  user_name: string;
  activity_name: string;
  completed_at: string | Date;
  completed_by_name: string | null;
  items: Array<{
    inventoryItemId: string;
    code: string;
    product: string;
    color: string;
    startingGrams: string | number;
    provisionalUsedGrams: string | number;
    reservedRemainingGrams: string | number;
  }>;
};

type UsageCorrectionRow = {
  id: string;
  session_id: string;
  usage_number: string;
  user_name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  requested_by_user_id: string | null;
  requested_by_name: string;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  review_note: string;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  items: Array<{
    inventoryItemId: string;
    code: string;
    product: string;
    color: string;
    beforeUsedGrams: string | number;
    afterUsedGrams: string | number;
  }>;
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
      await ensureAuditSchema();
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
          status text not null check (status in ('AVAILABLE', 'IN_USE', 'NEEDS_WEIGHING', 'LOW_STOCK', 'EMPTY', 'DAMAGED', 'INACTIVE')),
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
          measurement_status text not null default 'MEASURED' check (measurement_status in ('MEASURED', 'PENDING')),
          provisional_used_grams numeric(12,2),
          weighed_by_user_id uuid,
          weighed_by_name text,
          weighed_at timestamptz,
          weighing_note text not null default '',
          primary key (session_id, inventory_item_id)
        )
      `;
      await sql`
        do $$ begin
          if exists (
            select 1 from pg_constraint
            where conrelid = 'inventory_items'::regclass and conname = 'inventory_items_status_check'
              and pg_get_constraintdef(oid) not like '%NEEDS_WEIGHING%'
          ) then
            alter table inventory_items drop constraint inventory_items_status_check;
          end if;
          if not exists (
            select 1 from pg_constraint
            where conrelid = 'inventory_items'::regclass and conname = 'inventory_items_status_check'
          ) then
            alter table inventory_items add constraint inventory_items_status_check
              check (status in ('AVAILABLE', 'IN_USE', 'NEEDS_WEIGHING', 'LOW_STOCK', 'EMPTY', 'DAMAGED', 'INACTIVE'));
          end if;
        end $$
      `;
      await sql`create index if not exists usage_sessions_status_started_idx on usage_sessions (status, started_at desc)`;
      await sql`create index if not exists usage_session_items_inventory_idx on usage_session_items (inventory_item_id)`;
      await sql`alter table usage_sessions add column if not exists result text check (result in ('SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED'))`;
      await sql`alter table usage_sessions add column if not exists notes text not null default ''`;
      await sql`alter table usage_sessions add column if not exists borrower_user_id uuid`;
      await sql`alter table usage_sessions add column if not exists created_by_user_id uuid`;
      await sql`alter table usage_sessions add column if not exists created_by_name text`;
      await sql`alter table usage_sessions add column if not exists completed_by_user_id uuid`;
      await sql`alter table usage_sessions add column if not exists completed_by_name text`;
      await sql`alter table usage_sessions add column if not exists activity_name text not null default ''`;
      await sql`alter table usage_session_items add column if not exists measurement_status text not null default 'MEASURED' check (measurement_status in ('MEASURED', 'PENDING'))`;
      await sql`alter table usage_session_items add column if not exists provisional_used_grams numeric(12,2)`;
      await sql`alter table usage_session_items add column if not exists weighed_by_user_id uuid`;
      await sql`alter table usage_session_items add column if not exists weighed_by_name text`;
      await sql`alter table usage_session_items add column if not exists weighed_at timestamptz`;
      await sql`alter table usage_session_items add column if not exists weighing_note text not null default ''`;
      await sql`create index if not exists usage_sessions_borrower_idx on usage_sessions(borrower_user_id, started_at desc)`;
      await sql`create index if not exists usage_session_items_measurement_idx on usage_session_items(measurement_status, session_id)`;
      await sql`
        create table if not exists usage_corrections (
          id uuid primary key,
          session_id uuid not null references usage_sessions(id) on delete restrict,
          status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
          reason text not null,
          requested_by_user_id uuid,
          requested_by_name text not null,
          reviewed_by_user_id uuid,
          reviewed_by_name text,
          review_note text not null default '',
          created_at timestamptz not null default now(),
          reviewed_at timestamptz
        )
      `;
      await sql`
        create table if not exists usage_correction_items (
          correction_id uuid not null references usage_corrections(id) on delete cascade,
          inventory_item_id uuid not null references inventory_items(id) on delete restrict,
          before_used_grams numeric(12,2) not null check (before_used_grams >= 0),
          after_used_grams numeric(12,2) not null check (after_used_grams >= 0),
          primary key (correction_id, inventory_item_id)
        )
      `;
      await sql`create unique index if not exists usage_corrections_one_pending_idx on usage_corrections(session_id) where status = 'PENDING'`;
      await sql`create index if not exists usage_corrections_status_time_idx on usage_corrections(status, created_at desc)`;
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
    borrowerUserId: row.borrower_user_id,
    createdByName: row.created_by_name,
    completedByName: row.completed_by_name,
    activityName: row.activity_name,
    usageType: row.usage_type,
    nonClassType: row.non_class_type,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    unitCount: Number(row.unit_count),
    totalStartingGrams: Number(row.total_starting_grams),
    totalUsedGrams: Number(row.total_used_grams),
    totalReturnedGrams: Number(row.total_returned_grams),
    needsWeighing: Number(row.pending_measurement_count) > 0,
    colors: Array.isArray(row.colors) ? row.colors.map(String) : [],
    result: row.result,
    notes: row.notes,
  };
}

function mapUsageCorrection(row: UsageCorrectionRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionNumber: row.usage_number,
    userName: row.user_name,
    status: row.status,
    reason: row.reason,
    requestedByUserId: row.requested_by_user_id,
    requestedByName: row.requested_by_name,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedByName: row.reviewed_by_name,
    reviewNote: row.review_note,
    createdAt: new Date(row.created_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    items: (Array.isArray(row.items) ? row.items : []).map((item) => ({
      inventoryItemId: item.inventoryItemId,
      code: item.code,
      product: item.product,
      color: item.color,
      beforeUsedGrams: Number(item.beforeUsedGrams),
      afterUsedGrams: Number(item.afterUsedGrams),
      stockDeltaGrams: Number(item.beforeUsedGrams) - Number(item.afterUsedGrams),
    })),
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

  const activityName = String(input.activityName ?? "").trim();
  if (activityName.length > 160) throw new Error("Nama kelas atau kegiatan maksimal 160 karakter.");
  return { userName, usageType, nonClassType, inventoryItemIds, activityName };
}

export function parseUsageCompletionInput(value: unknown): UsageCompletionInput {
  if (!value || typeof value !== "object") throw new Error("Data penyelesaian tidak valid.");
  const input = value as Record<string, unknown>;
  const result = String(input.result ?? "") as UsageCompletionInput["result"];
  const measurementMode = String(input.measurementMode ?? "MEASURED") as UsageCompletionInput["measurementMode"];
  const notes = String(input.notes ?? "").trim();
  if (!completionResults.includes(result)) throw new Error("Pilih hasil pekerjaan yang valid.");
  if (!(measurementMode === "MEASURED" || measurementMode === "UNKNOWN")) throw new Error("Status penimbangan tidak valid.");
  if (measurementMode === "UNKNOWN" && result !== "FAILED") throw new Error("Gram belum diketahui hanya dapat dipilih untuk hasil gagal.");
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
  return { result, measurementMode, notes, items };
}

export function parseUsageWeighingInput(value: unknown): UsageWeighingInput {
  if (!value || typeof value !== "object") throw new Error("Data penimbangan tidak valid.");
  const input = value as Record<string, unknown>;
  const note = String(input.note ?? "").trim();
  if (note.length < 3 || note.length > 500) throw new Error("Isi catatan penimbangan, 3–500 karakter.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error("Lengkapi hasil timbang seluruh unit.");
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Data unit penimbangan tidak valid.");
    const item = raw as Record<string, unknown>;
    const inventoryItemId = String(item.inventoryItemId ?? "").trim().toLowerCase();
    const remainingGrams = item.remainingGrams;
    if (!uuidPattern.test(inventoryItemId)) throw new Error("Identitas unit penimbangan tidak valid.");
    if (typeof remainingGrams !== "number" || !Number.isFinite(remainingGrams) || remainingGrams < 0 || remainingGrams > 100000 || Math.abs(remainingGrams * 100 - Math.round(remainingGrams * 100)) > 0.000001) {
      throw new Error("Sisa gram hasil timbang wajib berupa angka 0–100.000, maksimal 2 angka desimal.");
    }
    return { inventoryItemId, remainingGrams };
  });
  if (new Set(items.map((item) => item.inventoryItemId)).size !== items.length) throw new Error("Unit penimbangan tidak boleh dikirim dua kali.");
  return { note, items };
}

export function parseUsageCorrectionInput(value: unknown): UsageCorrectionInput {
  if (!value || typeof value !== "object") throw new Error("Data koreksi tidak valid.");
  const input = value as Record<string, unknown>;
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("Isi alasan koreksi, 3–500 karakter.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error("Lengkapi gram koreksi untuk seluruh unit sesi.");
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Data unit koreksi tidak valid.");
    const item = raw as Record<string, unknown>;
    const inventoryItemId = String(item.inventoryItemId ?? "").trim().toLowerCase();
    const usedGrams = item.usedGrams;
    if (!uuidPattern.test(inventoryItemId)) throw new Error("Identitas unit koreksi tidak valid.");
    if (typeof usedGrams !== "number" || !Number.isFinite(usedGrams) || usedGrams < 0 || usedGrams > 100000 || Math.abs(usedGrams * 100 - Math.round(usedGrams * 100)) > 0.000001) {
      throw new Error("Gram koreksi wajib berupa angka 0–100.000, maksimal 2 angka desimal.");
    }
    return { inventoryItemId, usedGrams };
  });
  if (new Set(items.map((item) => item.inventoryItemId)).size !== items.length) throw new Error("Unit koreksi tidak boleh dikirim dua kali.");
  return { reason, items };
}

export function parseUsageCorrectionReviewInput(value: unknown): UsageCorrectionReviewInput {
  if (!value || typeof value !== "object") throw new Error("Data peninjauan tidak valid.");
  const input = value as Record<string, unknown>;
  const decision = String(input.decision ?? "") as UsageCorrectionReviewInput["decision"];
  const note = String(input.note ?? "").trim();
  if (!(["APPROVE", "REJECT"] as const).includes(decision)) throw new Error("Keputusan koreksi tidak valid.");
  if (note.length > 500 || (decision === "REJECT" && note.length < 3)) throw new Error("Isi alasan penolakan, 3–500 karakter.");
  return { decision, note };
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

function usageQuery(id?: string, actor?: Actor, history = false) {
  const sql = getSql();
  return id
    ? sql`
        select s.*, count(i.inventory_item_id)::int as unit_count,
          coalesce(sum(i.starting_grams), 0) as total_starting_grams,
          coalesce(sum(i.used_grams), 0) as total_used_grams,
          coalesce(sum(i.returned_grams), 0) as total_returned_grams,
          count(*) filter (where i.measurement_status = 'PENDING')::int as pending_measurement_count,
          coalesce(
            array_agg(distinct inv.color order by inv.color)
              filter (where inv.color is not null and btrim(inv.color) <> ''),
            array[]::text[]
          ) as colors
        from usage_sessions s
        left join usage_session_items i on i.session_id = s.id
        left join inventory_items inv on inv.id = i.inventory_item_id
        where s.id = ${id}
          and (${actor?.role !== "COACH"} or s.borrower_user_id = ${actor?.id ?? null}::uuid)
        group by s.id
      `
    : sql`
        select s.*, count(i.inventory_item_id)::int as unit_count,
          coalesce(sum(i.starting_grams), 0) as total_starting_grams,
          coalesce(sum(i.used_grams), 0) as total_used_grams,
          coalesce(sum(i.returned_grams), 0) as total_returned_grams,
          count(*) filter (where i.measurement_status = 'PENDING')::int as pending_measurement_count,
          coalesce(
            array_agg(distinct inv.color order by inv.color)
              filter (where inv.color is not null and btrim(inv.color) <> ''),
            array[]::text[]
          ) as colors
        from usage_sessions s
        left join usage_session_items i on i.session_id = s.id
        left join inventory_items inv on inv.id = i.inventory_item_id
        where (${history} or s.status = 'ACTIVE')
          and (${actor?.role !== "COACH"} or s.borrower_user_id = ${actor?.id ?? null}::uuid)
        group by s.id
        order by s.started_at desc
      `;
}

export async function listActiveUsageSessions(actor?: Actor) {
  await ensureUsageSchema();
  const rows = await usageQuery(undefined, actor);
  return (rows as UsageRow[]).map(mapUsage);
}

export async function getUsageSession(id: string, actor?: Actor) {
  if (!uuidPattern.test(id)) throw new Error("Nomor sesi tidak valid.");
  await ensureUsageSchema();
  const rows = await usageQuery(id, actor);
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
      measurementStatus: item.measurement_status,
      provisionalUsedGrams: item.provisional_used_grams === null ? null : Number(item.provisional_used_grams),
      weighedByName: item.weighed_by_name,
      weighedAt: item.weighed_at ? new Date(item.weighed_at).toISOString() : null,
      weighingNote: item.weighing_note,
    })),
  };
}

export async function findActiveUsageByBarcode(barcode: string, actor?: Actor) {
  const code = barcode.trim().toUpperCase();
  if (!code || code.length > 40) throw new Error("Masukkan barcode unit yang valid.");
  await ensureUsageSchema();
  const sql = getSql();
  const rows = await sql`
    select s.id from usage_sessions s
    join usage_session_items item on item.session_id = s.id
    join inventory_items inv on inv.id = item.inventory_item_id
    where s.status = 'ACTIVE' and inv.code = ${code}
      and (${actor?.role !== "COACH"} or s.borrower_user_id = ${actor?.id ?? null}::uuid)
    limit 2
  `;
  if (rows.length > 1) throw new Error("Unit terkait lebih dari satu sesi aktif. Periksa data sesi sebelum melanjutkan.");
  return rows[0] ? getUsageSession(String(rows[0].id), actor) : null;
}

export async function listMyUsageSessions(actor: Actor) {
  await ensureUsageSchema();
  const rows = await usageQuery(undefined, { ...actor, role: "COACH" }, true);
  return (rows as UsageRow[]).map(mapUsage);
}

export async function listUsageCorrections(actor: Actor, sessionId?: string) {
  if (sessionId && !uuidPattern.test(sessionId)) throw new Error("Nomor sesi tidak valid.");
  if (!sessionId && !isStaff(actor)) throw new Error("FORBIDDEN");
  await ensureUsageSchema();
  const sql = getSql();
  const rows = await sql`
    select c.*, s.usage_number, s.user_name,
      coalesce(
        json_agg(json_build_object(
          'inventoryItemId', ci.inventory_item_id,
          'code', inv.code,
          'product', inv.product,
          'color', inv.color,
          'beforeUsedGrams', ci.before_used_grams,
          'afterUsedGrams', ci.after_used_grams
        ) order by inv.code) filter (where ci.inventory_item_id is not null),
        '[]'::json
      ) as items
    from usage_corrections c
    join usage_sessions s on s.id = c.session_id
    left join usage_correction_items ci on ci.correction_id = c.id
    left join inventory_items inv on inv.id = ci.inventory_item_id
    where (${sessionId === undefined} or c.session_id = ${sessionId ?? null}::uuid)
      and (${actor.role !== "COACH"} or s.borrower_user_id = ${actor.id}::uuid)
    group by c.id, s.id
    order by case when c.status = 'PENDING' then 0 else 1 end, c.created_at desc
    limit 200
  `;
  return (rows as UsageCorrectionRow[]).map(mapUsageCorrection);
}

export async function createUsageCorrection(sessionId: string, input: UsageCorrectionInput, actor: Actor) {
  const session = await getUsageSession(sessionId, actor);
  if (!session) throw new Error("USAGE_NOT_FOUND");
  if (session.status !== "COMPLETED") throw new Error("CORRECTION_SESSION_NOT_COMPLETED");
  if (session.needsWeighing) throw new Error("CORRECTION_MEASUREMENT_PENDING");
  if (input.items.length !== session.items.length) throw new Error("CORRECTION_ITEMS_MISMATCH");
  const currentById = new Map(session.items.map((item) => [item.inventoryItemId, item]));
  const changes = input.items.map((item) => {
    const current = currentById.get(item.inventoryItemId);
    if (!current || current.usedGrams === null || item.usedGrams > current.startingGrams) throw new Error("CORRECTION_ITEMS_MISMATCH");
    return { inventoryItemId: item.inventoryItemId, beforeUsedGrams: current.usedGrams, afterUsedGrams: item.usedGrams };
  });
  if (changes.every((item) => item.beforeUsedGrams === item.afterUsedGrams)) throw new Error("CORRECTION_NO_CHANGE");

  await ensureUsageSchema();
  const sql = getSql();
  const id = crypto.randomUUID();
  const requestedItems = JSON.stringify(changes);
  const rows = await sql`
    with requested as (
      select * from jsonb_to_recordset(${requestedItems}::jsonb)
      as item("inventoryItemId" uuid, "beforeUsedGrams" numeric, "afterUsedGrams" numeric)
    ), valid_items as (
      select item.*, usage_item.starting_grams
      from requested item
      join usage_session_items usage_item on usage_item.session_id = ${sessionId} and usage_item.inventory_item_id = item."inventoryItemId"
      where usage_item.used_grams = item."beforeUsedGrams" and usage_item.measurement_status = 'MEASURED'
        and item."afterUsedGrams" between 0 and usage_item.starting_grams
    ), created as (
      insert into usage_corrections(id, session_id, reason, requested_by_user_id, requested_by_name)
      select ${id}, ${sessionId}, ${input.reason}, ${actor.id}, ${actor.name}
      where (select count(*) from valid_items) = ${changes.length}
        and not exists (select 1 from usage_corrections where session_id = ${sessionId} and status = 'PENDING')
      returning id
    ), created_items as (
      insert into usage_correction_items(correction_id, inventory_item_id, before_used_grams, after_used_grams)
      select created.id, item."inventoryItemId", item."beforeUsedGrams", item."afterUsedGrams"
      from created cross join valid_items item
      returning inventory_item_id
    ), logged as (
      insert into audit_events(id, actor_user_id, actor_name, action, entity_type, entity_id, reason, before_data, after_data)
      select ${crypto.randomUUID()}, ${actor.id}, ${actor.name}, 'USAGE_CORRECTION_REQUESTED', 'usage', ${sessionId}, ${input.reason},
        ${JSON.stringify(changes.map((item) => ({ inventoryItemId: item.inventoryItemId, usedGrams: item.beforeUsedGrams })))}::jsonb,
        ${JSON.stringify(changes.map((item) => ({ inventoryItemId: item.inventoryItemId, usedGrams: item.afterUsedGrams })))}::jsonb
      from created where (select count(*) from created_items) = ${changes.length}
      returning id
    )
    select id from created where (select count(*) from logged) = 1
  `;
  if (!rows[0]) throw new Error("CORRECTION_REQUEST_CONFLICT");
  if (isStaff(actor)) return reviewUsageCorrection(id, { decision: "APPROVE", note: "" }, actor);
  return (await listUsageCorrections(actor, sessionId)).find((item) => item.id === id)!;
}

export async function reviewUsageCorrection(id: string, input: UsageCorrectionReviewInput, actor: Actor) {
  if (!uuidPattern.test(id)) throw new Error("Koreksi tidak valid.");
  if (!isStaff(actor)) throw new Error("FORBIDDEN");
  await ensureUsageSchema();
  const sql = getSql();
  const pointer = await sql`select session_id from usage_corrections where id = ${id}`;
  const existing = pointer[0] ? (await listUsageCorrections(actor, String(pointer[0].session_id))).find((item) => item.id === id) : undefined;
  if (!existing) throw new Error("CORRECTION_NOT_FOUND");
  if (existing.status !== "PENDING") throw new Error("CORRECTION_ALREADY_REVIEWED");

  if (input.decision === "REJECT") {
    const rows = await sql`
      with rejected as (
        update usage_corrections set status = 'REJECTED', reviewed_by_user_id = ${actor.id}, reviewed_by_name = ${actor.name},
          review_note = ${input.note}, reviewed_at = now()
        where id = ${id} and status = 'PENDING'
        returning id, session_id
      ), logged as (
        insert into audit_events(id, actor_user_id, actor_name, action, entity_type, entity_id, reason, before_data, after_data)
        select ${crypto.randomUUID()}, ${actor.id}, ${actor.name}, 'USAGE_CORRECTION_REJECTED', 'usage', session_id::text, ${input.note},
          ${JSON.stringify({ correctionId: id, status: "PENDING" })}::jsonb,
          ${JSON.stringify({ correctionId: id, status: "REJECTED" })}::jsonb
        from rejected returning id
      ) select id from rejected where (select count(*) from logged) = 1
    `;
    if (!rows[0]) throw new Error("CORRECTION_ALREADY_REVIEWED");
    return (await listUsageCorrections(actor)).find((item) => item.id === id)!;
  }

  const rows = await sql`
    with target as (
      select correction.id, correction.session_id
      from usage_corrections correction
      join usage_sessions session on session.id = correction.session_id and session.status = 'COMPLETED'
      where correction.id = ${id} and correction.status = 'PENDING'
      for update
    ), correction_items as (
      select item.*, usage_item.starting_grams, usage_item.used_grams, usage_item.measurement_status,
        inventory.remaining_grams, inventory.status as inventory_status
      from usage_correction_items item
      join target on target.id = item.correction_id
      join usage_session_items usage_item on usage_item.session_id = target.session_id and usage_item.inventory_item_id = item.inventory_item_id
      join inventory_items inventory on inventory.id = item.inventory_item_id
    ), locked_inventory as (
      select inventory.id
      from inventory_items inventory join correction_items item on item.inventory_item_id = inventory.id
      order by inventory.id for update
    ), ready as (
      select target.* from target
      where (select count(*) from correction_items) > 0
        and (select count(*) from locked_inventory) = (select count(*) from correction_items)
        and not exists (
          select 1 from correction_items item
          where item.used_grams is distinct from item.before_used_grams
            or item.after_used_grams > item.starting_grams
            or item.measurement_status <> 'MEASURED'
            or item.inventory_status in ('IN_USE', 'NEEDS_WEIGHING')
            or item.remaining_grams + item.before_used_grams - item.after_used_grams < 0
        )
    ), updated_inventory as (
      update inventory_items inventory
      set remaining_grams = inventory.remaining_grams + item.before_used_grams - item.after_used_grams,
        status = case
          when inventory.status in ('DAMAGED', 'INACTIVE') then inventory.status
          when inventory.remaining_grams + item.before_used_grams - item.after_used_grams <= 0 then 'EMPTY'
          when inventory.remaining_grams + item.before_used_grams - item.after_used_grams < 500 then 'LOW_STOCK'
          else 'AVAILABLE'
        end,
        updated_at = now()
      from correction_items item, ready
      where inventory.id = item.inventory_item_id
      returning inventory.id
    ), updated_usage_items as (
      update usage_session_items usage_item
      set used_grams = item.after_used_grams, returned_grams = usage_item.starting_grams - item.after_used_grams
      from correction_items item, ready
      where usage_item.session_id = ready.session_id and usage_item.inventory_item_id = item.inventory_item_id
      returning usage_item.inventory_item_id
    ), approved as (
      update usage_corrections correction
      set status = 'APPROVED', reviewed_by_user_id = ${actor.id}, reviewed_by_name = ${actor.name},
        review_note = ${input.note}, reviewed_at = now()
      from ready
      where correction.id = ready.id
        and (select count(*) from updated_inventory) = (select count(*) from correction_items)
        and (select count(*) from updated_usage_items) = (select count(*) from correction_items)
      returning correction.id, correction.session_id
    ), logged as (
      insert into audit_events(id, actor_user_id, actor_name, action, entity_type, entity_id, reason, before_data, after_data)
      select ${crypto.randomUUID()}, ${actor.id}, ${actor.name}, 'USAGE_CORRECTION_APPROVED', 'usage', session_id::text, ${existing.reason},
        ${JSON.stringify(existing.items.map((item) => ({ code: item.code, usedGrams: item.beforeUsedGrams })))}::jsonb,
        ${JSON.stringify(existing.items.map((item) => ({ code: item.code, usedGrams: item.afterUsedGrams, stockDeltaGrams: item.stockDeltaGrams })))}::jsonb
      from approved returning id
    ) select id from approved where (select count(*) from logged) = 1
  `;
  if (!rows[0]) throw new Error("CORRECTION_APPLY_CONFLICT");
  return (await listUsageCorrections(actor)).find((item) => item.id === id)!;
}

export async function listUsageWeighings(actor: Actor) {
  if (!isStaff(actor)) throw new Error("FORBIDDEN");
  await ensureUsageSchema();
  const sql = getSql();
  const rows = await sql`
    select session.id, session.usage_number, session.user_name, session.activity_name,
      session.completed_at, session.completed_by_name,
      json_agg(json_build_object(
        'inventoryItemId', item.inventory_item_id,
        'code', inventory.code,
        'product', inventory.product,
        'color', inventory.color,
        'startingGrams', item.starting_grams,
        'provisionalUsedGrams', item.provisional_used_grams,
        'reservedRemainingGrams', item.returned_grams
      ) order by inventory.code) as items
    from usage_sessions session
    join usage_session_items item on item.session_id = session.id and item.measurement_status = 'PENDING'
    join inventory_items inventory on inventory.id = item.inventory_item_id
    where session.status = 'COMPLETED'
    group by session.id
    order by session.completed_at asc
    limit 200
  `;
  return (rows as UsageWeighingRow[]).map((row) => ({
    id: row.id,
    number: row.usage_number,
    userName: row.user_name,
    activityName: row.activity_name,
    completedAt: new Date(row.completed_at).toISOString(),
    completedByName: row.completed_by_name,
    items: row.items.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      code: item.code,
      product: item.product,
      color: item.color,
      startingGrams: Number(item.startingGrams),
      provisionalUsedGrams: Number(item.provisionalUsedGrams),
      reservedRemainingGrams: Number(item.reservedRemainingGrams),
    })),
  }));
}

export async function verifyUsageWeighing(sessionId: string, input: UsageWeighingInput, actor: Actor) {
  if (!uuidPattern.test(sessionId)) throw new Error("Penimbangan tidak valid.");
  if (!isStaff(actor)) throw new Error("FORBIDDEN");
  const existing = (await listUsageWeighings(actor)).find((item) => item.id === sessionId);
  if (!existing) throw new Error("WEIGHING_NOT_FOUND");
  if (input.items.length !== existing.items.length) throw new Error("WEIGHING_ITEMS_MISMATCH");
  const existingById = new Map(existing.items.map((item) => [item.inventoryItemId, item]));
  for (const item of input.items) {
    const current = existingById.get(item.inventoryItemId);
    if (!current || item.remainingGrams > current.startingGrams) throw new Error("WEIGHING_ITEMS_MISMATCH");
  }

  const sql = getSql();
  const requestedItems = JSON.stringify(input.items.map((item) => ({
    inventory_item_id: item.inventoryItemId,
    remaining_grams: item.remainingGrams,
  })));
  const rows = await sql`
    with requested as (
      select * from jsonb_to_recordset(${requestedItems}::jsonb)
      as req(inventory_item_id uuid, remaining_grams numeric)
    ), target as (
      select id from usage_sessions where id = ${sessionId} and status = 'COMPLETED' for update
    ), pending_items as (
      select item.inventory_item_id, item.starting_grams, item.used_grams, item.returned_grams,
        item.provisional_used_grams, inventory.remaining_grams as inventory_grams, inventory.status as inventory_status
      from usage_session_items item
      join target on target.id = item.session_id
      join inventory_items inventory on inventory.id = item.inventory_item_id
      where item.measurement_status = 'PENDING'
    ), locked_inventory as (
      select inventory.id
      from inventory_items inventory join pending_items item on item.inventory_item_id = inventory.id
      order by inventory.id for update
    ), valid_items as (
      select item.*, req.remaining_grams as measured_remaining_grams
      from pending_items item join requested req on req.inventory_item_id = item.inventory_item_id
      where item.inventory_status = 'NEEDS_WEIGHING'
        and item.provisional_used_grams is not null
        and item.inventory_grams = item.starting_grams - item.provisional_used_grams
        and req.remaining_grams between 0 and item.starting_grams
    ), ready as (
      select id from target
      where (select count(*) from pending_items) = ${input.items.length}
        and (select count(*) from locked_inventory) = ${input.items.length}
        and (select count(*) from valid_items) = ${input.items.length}
    ), updated_inventory as (
      update inventory_items inventory
      set remaining_grams = item.measured_remaining_grams,
        status = case
          when item.measured_remaining_grams = 0 then 'EMPTY'
          when item.measured_remaining_grams < 500 then 'LOW_STOCK'
          else 'AVAILABLE'
        end,
        updated_at = now()
      from valid_items item, ready
      where inventory.id = item.inventory_item_id
      returning inventory.id
    ), updated_items as (
      update usage_session_items usage_item
      set used_grams = usage_item.starting_grams - item.measured_remaining_grams,
        returned_grams = item.measured_remaining_grams,
        measurement_status = 'MEASURED', weighed_by_user_id = ${actor.id}, weighed_by_name = ${actor.name},
        weighed_at = now(), weighing_note = ${input.note}
      from valid_items item, ready
      where usage_item.session_id = ready.id and usage_item.inventory_item_id = item.inventory_item_id
      returning usage_item.inventory_item_id
    ), logged as (
      insert into audit_events(id, actor_user_id, actor_name, action, entity_type, entity_id, reason, before_data, after_data)
      select ${crypto.randomUUID()}, ${actor.id}, ${actor.name}, 'USAGE_WEIGHING_VERIFIED', 'usage', id::text, ${input.note},
        ${JSON.stringify(existing.items.map((item) => ({ code: item.code, provisionalUsedGrams: item.provisionalUsedGrams, reservedRemainingGrams: item.reservedRemainingGrams })))}::jsonb,
        ${JSON.stringify(existing.items.map((item) => {
          const measured = input.items.find((candidate) => candidate.inventoryItemId === item.inventoryItemId)!;
          return { code: item.code, usedGrams: item.startingGrams - measured.remainingGrams, remainingGrams: measured.remainingGrams };
        }))}::jsonb
      from ready
      where (select count(*) from updated_inventory) = ${input.items.length}
        and (select count(*) from updated_items) = ${input.items.length}
      returning id
    ) select id from ready where (select count(*) from logged) = 1
  `;
  if (!rows[0]) throw new Error("WEIGHING_APPLY_CONFLICT");
  return getUsageSession(sessionId, actor);
}

export async function createUsageSession(input: UsageInput, actor?: Actor) {
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
      insert into usage_sessions (id, usage_number, user_name, usage_type, non_class_type, activity_name, borrower_user_id, created_by_user_id, created_by_name)
      select ${id}, ${number}, ${input.userName}, ${input.usageType}, ${input.nonClassType}, ${input.activityName ?? ""}, ${input.borrowerUserId ?? actor?.id ?? null}, ${actor?.id ?? null}, ${actor?.name ?? null}
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
    , logged as (
      insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data)
      select ${crypto.randomUUID()},${actor?.id ?? null},${actor?.name ?? input.userName},'USAGE_STARTED','usage',id::text,
        jsonb_build_object('number',${number}::text,'borrower',${input.userName}::text,'activity',${input.activityName ?? ""}::text,'units',${input.inventoryItemIds.length}::int) from new_session returning id
    ) select id from new_session
  `;
  if (!rows[0]) throw new Error("UNIT_NOT_AVAILABLE");
  return getUsageSession(id);
}

export async function completeUsageSession(id: string, input: UsageCompletionInput, actor?: Actor) {
  const existing = await getUsageSession(id, actor);
  if (!existing) throw new Error("USAGE_NOT_FOUND");
  if (existing.status !== "ACTIVE") throw new Error("USAGE_ALREADY_COMPLETED");
  const sql = getSql();
  const requestedItems = JSON.stringify(input.items.map((item) => ({
    inventory_item_id: item.inventoryItemId,
    barcode: item.barcode,
    used_grams: item.usedGrams,
  })));
  const measurementPending = input.measurementMode === "UNKNOWN";
  const completionAction = measurementPending ? "USAGE_COMPLETED_UNWEIGHED" : "USAGE_COMPLETED";

  // Lock the session and inventory, validate the complete set, then write all changes in one statement.
  const rows = await sql`
    with requested as (
      select * from jsonb_to_recordset(${requestedItems}::jsonb)
      as req(inventory_item_id uuid, barcode text, used_grams numeric)
    ), target as (
      select id from usage_sessions where id = ${id} and status = 'ACTIVE'
        and (${actor?.role !== "COACH"} or borrower_user_id = ${actor?.id ?? null}::uuid) for update
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
          when ${measurementPending} then 'NEEDS_WEIGHING'
          when eligible.remaining_grams - eligible.used_grams = 0 then 'EMPTY'
          when eligible.remaining_grams - eligible.used_grams < 500 then 'LOW_STOCK'
          else 'AVAILABLE'
        end,
        updated_at = now()
      from eligible, ready where inv.id = eligible.id
      returning inv.id, inv.remaining_grams
    ), updated_items as (
      update usage_session_items item
      set used_grams = req.used_grams, returned_grams = inv.remaining_grams,
        measurement_status = case when ${measurementPending} then 'PENDING' else 'MEASURED' end,
        provisional_used_grams = case when ${measurementPending} then req.used_grams else null end,
        weighed_by_user_id = null, weighed_by_name = null, weighed_at = null, weighing_note = ''
      from requested req, updated_inventory inv, ready
      where item.session_id = ready.id and item.inventory_item_id = inv.id and req.inventory_item_id = inv.id
      returning item.inventory_item_id
    ), completed as (
      update usage_sessions s
      set status = 'COMPLETED', result = ${input.result}, notes = ${input.notes}, completed_at = now(), updated_at = now(),
        completed_by_user_id = ${actor?.id ?? null}, completed_by_name = ${actor?.name ?? null}
      from ready where s.id = ready.id and (select count(*) from updated_items) = ${input.items.length}
      returning s.id
    )
    , logged as (
      insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,before_data,after_data)
      select ${crypto.randomUUID()},${actor?.id ?? null},${actor?.name ?? existing.userName},${completionAction},'usage',id::text,
        ${JSON.stringify({ number: existing.number, items: existing.items.map(item => ({ code: item.code, grams: item.startingGrams })) })}::jsonb,
        ${JSON.stringify({ number: existing.number, result: input.result, measurementMode: input.measurementMode, items: input.items })}::jsonb from completed returning id
    ) select id from completed
  `;
  if (!rows[0]) throw new Error("USAGE_COMPLETION_CONFLICT");
  return getUsageSession(id);
}
