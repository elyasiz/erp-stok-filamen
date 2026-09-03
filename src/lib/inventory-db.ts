import "server-only";

import { neon } from "@neondatabase/serverless";
import { ensureAuditSchema } from "./audit-db";
import type { Actor } from "./account-types";

export const inventoryStatuses = ["AVAILABLE", "IN_USE", "LOW_STOCK", "EMPTY", "DAMAGED", "INACTIVE"] as const;
export const packagingTypes = ["WITH_SPOOL", "REFILL"] as const;

export type InventoryStatus = (typeof inventoryStatuses)[number];
export type PackagingType = (typeof packagingTypes)[number];

export type InventoryInput = {
  code: string;
  product: string;
  material: string;
  color: string;
  packagingType: PackagingType;
  remainingGrams: number;
  status: InventoryStatus;
  unitCost: number;
  supplier: string;
};

type InventoryRow = {
  id: string;
  code: string;
  product: string;
  material: string;
  color: string;
  packaging_type: PackagingType;
  remaining_grams: string | number;
  status: InventoryStatus;
  unit_cost: string | number;
  supplier: string;
  created_at: string | Date;
  updated_at: string | Date;
};

let schemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(databaseUrl);
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
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
      await sql`create index if not exists inventory_items_status_idx on inventory_items (status)`;
      await sql`create index if not exists inventory_items_material_idx on inventory_items (material)`;
      await sql`create index if not exists inventory_items_updated_idx on inventory_items (updated_at desc)`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function mapRow(row: InventoryRow) {
  return {
    id: row.id,
    code: row.code,
    product: row.product,
    material: row.material,
    color: row.color,
    packagingType: row.packaging_type,
    remainingGrams: Number(row.remaining_grams),
    status: row.status,
    unitCost: Number(row.unit_cost),
    supplier: row.supplier,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function parseInventoryInput(value: unknown): InventoryInput {
  if (!value || typeof value !== "object") throw new Error("Data filamen tidak valid.");
  const input = value as Record<string, unknown>;
  const code = String(input.code ?? "").trim().toUpperCase();
  const product = String(input.product ?? "").trim();
  const material = String(input.material ?? "").trim().toUpperCase();
  const color = String(input.color ?? "").trim();
  const supplier = String(input.supplier ?? "").trim();
  const packagingType = String(input.packagingType ?? "") as PackagingType;
  const status = String(input.status ?? "") as InventoryStatus;
  const remainingGrams = Number(input.remainingGrams);
  const unitCost = Number(input.unitCost);

  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) throw new Error("Kode harus 3–40 karakter berupa huruf, angka, atau tanda hubung.");
  if (!product || product.length > 120) throw new Error("Nama produk wajib diisi, maksimal 120 karakter.");
  if (!material || material.length > 30) throw new Error("Material wajib diisi, maksimal 30 karakter.");
  if (!color || color.length > 60) throw new Error("Warna wajib diisi, maksimal 60 karakter.");
  if (!supplier || supplier.length > 120) throw new Error("Supplier wajib diisi, maksimal 120 karakter.");
  if (!packagingTypes.includes(packagingType)) throw new Error("Jenis kemasan tidak valid.");
  if (!inventoryStatuses.includes(status)) throw new Error("Status stok tidak valid.");
  if (!Number.isFinite(remainingGrams) || remainingGrams < 0 || remainingGrams > 100000) throw new Error("Sisa gram harus antara 0 dan 100.000.");
  if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000_000_000) throw new Error("Harga unit tidak valid.");

  return { code, product, material, color, supplier, packagingType, status, remainingGrams, unitCost };
}

export async function listInventory() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`select * from inventory_items order by updated_at desc, code asc`;
  return (rows as InventoryRow[]).map(mapRow);
}

export async function getInventoryItem(id: string) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`select * from inventory_items where id = ${id} limit 1`;
  return rows[0] ? mapRow(rows[0] as InventoryRow) : null;
}

export async function createInventoryItem(input: InventoryInput, actor: Actor) {
  await ensureAuditSchema();
  await ensureSchema();
  const sql = getSql();
  const id = crypto.randomUUID();
  const rows = await sql`
    with changed as (insert into inventory_items (id, code, product, material, color, packaging_type, remaining_grams, status, unit_cost, supplier)
    values (${id}, ${input.code}, ${input.product}, ${input.material}, ${input.color}, ${input.packagingType}, ${input.remainingGrams}, ${input.status}, ${input.unitCost}, ${input.supplier})
    returning *), logged as (
      insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data)
      select ${crypto.randomUUID()},${actor.id},${actor.name},'STOCK_CREATED','inventory',id::text,to_jsonb(changed) from changed returning id
    ) select changed.* from changed, logged
  `;
  return mapRow(rows[0] as InventoryRow);
}

export async function updateInventoryItem(id: string, input: InventoryInput, actor: Actor, reason: string) {
  await ensureAuditSchema();
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    with previous as (select * from inventory_items where id=${id} for update), changed as (update inventory_items inv
    set code = ${input.code}, product = ${input.product}, material = ${input.material}, color = ${input.color},
        packaging_type = ${input.packagingType}, remaining_grams = ${input.remainingGrams}, status = ${input.status},
        unit_cost = ${input.unitCost}, supplier = ${input.supplier}, updated_at = now()
    from previous p where inv.id = p.id and p.status <> 'IN_USE'
    returning inv.*), logged as (
      insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data)
      select ${crypto.randomUUID()},${actor.id},${actor.name},'STOCK_UPDATED','inventory',c.id::text,${reason},to_jsonb(p),to_jsonb(c) from changed c, previous p returning id
    ) select changed.* from changed, logged
  `;
  return rows[0] ? mapRow(rows[0] as InventoryRow) : null;
}

export async function deleteInventoryItem(id: string, actor: Actor, reason: string) {
  await ensureAuditSchema();
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`with deleted as (delete from inventory_items where id = ${id} and status <> 'IN_USE' returning *), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,reason,before_data)
    select ${crypto.randomUUID()},${actor.id},${actor.name},'STOCK_DELETED','inventory',id::text,${reason},to_jsonb(deleted) from deleted returning id
  ) select deleted.id from deleted, logged`;
  return Boolean(rows[0]);
}
