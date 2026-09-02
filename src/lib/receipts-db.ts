import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const receiptSuppliers = [
  "IndoCart",
  "3D Zaiku",
  "TekLab / PT Tek Lab Indonesia",
  "IndoMakers Indonesia",
  "IMA 3D Printer",
] as const;

const receiptStatuses = ["DRAFT", "FINALIZED"] as const;
const receiptPackagingTypes = ["WITH_SPOOL", "REFILL"] as const;

type ReceiptStatus = (typeof receiptStatuses)[number];
type ReceiptPackagingType = (typeof receiptPackagingTypes)[number];

export type ReceiptItemInput = {
  barcode: string;
  product: string;
  material: string;
  color: string;
  packagingType: ReceiptPackagingType;
  quantity: number;
  unitWeightGrams: number;
  unitCost: number;
};

export type ReceiptInput = {
  supplier: (typeof receiptSuppliers)[number];
  invoiceNumber: string;
  purchaseDate: string;
  receivedDate: string;
  status: ReceiptStatus;
  discount: number;
  tax: number;
  shipping: number;
  notes: string;
  items: ReceiptItemInput[];
};

type ReceiptRow = {
  id: string;
  receipt_number: string;
  supplier: string;
  invoice_number: string;
  purchase_date: string | Date;
  received_date: string | Date;
  status: ReceiptStatus;
  discount: string | number;
  tax: string | number;
  shipping: string | number;
  notes: string;
  subtotal: string | number;
  item_lines: string | number;
  unit_count: string | number;
  created_at: string | Date;
  updated_at: string | Date;
};

type ReceiptItemRow = {
  id: string;
  receipt_id: string;
  barcode: string;
  product: string;
  material: string;
  color: string;
  packaging_type: ReceiptPackagingType;
  quantity: string | number;
  unit_weight_grams: string | number;
  unit_cost: string | number;
  line_number: string | number;
};

let receiptSchemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(databaseUrl);
}

async function ensureReceiptSchema() {
  if (!receiptSchemaReady) {
    receiptSchemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists goods_receipts (
          id uuid primary key,
          receipt_number text not null unique,
          supplier text not null,
          invoice_number text not null,
          purchase_date date not null,
          received_date date not null,
          status text not null check (status in ('DRAFT', 'FINALIZED')),
          discount numeric(16,2) not null default 0 check (discount >= 0),
          tax numeric(16,2) not null default 0 check (tax >= 0),
          shipping numeric(16,2) not null default 0 check (shipping >= 0),
          notes text not null default '',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists goods_receipt_items (
          id uuid primary key,
          receipt_id uuid not null references goods_receipts(id) on delete cascade,
          barcode text not null,
          product text not null,
          material text not null,
          color text not null,
          packaging_type text not null check (packaging_type in ('WITH_SPOOL', 'REFILL')),
          quantity integer not null check (quantity > 0),
          unit_weight_grams numeric(12,2) not null check (unit_weight_grams > 0),
          unit_cost numeric(16,2) not null check (unit_cost >= 0),
          line_number integer not null
        )
      `;
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
      await sql`alter table inventory_items add column if not exists source_receipt_id uuid`;
      await sql`alter table inventory_items add column if not exists source_receipt_item_id uuid`;
      await sql`create index if not exists goods_receipts_updated_idx on goods_receipts (updated_at desc)`;
      await sql`create index if not exists goods_receipt_items_receipt_idx on goods_receipt_items (receipt_id, line_number)`;
      await sql`create index if not exists inventory_items_source_receipt_idx on inventory_items (source_receipt_id)`;
    })().catch((error) => {
      receiptSchemaReady = null;
      throw error;
    });
  }
  await receiptSchemaReady;
}

function dateOnly(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function mapReceipt(row: ReceiptRow) {
  const subtotal = Number(row.subtotal);
  const discount = Number(row.discount);
  const tax = Number(row.tax);
  const shipping = Number(row.shipping);
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    supplier: row.supplier,
    invoiceNumber: row.invoice_number,
    purchaseDate: dateOnly(row.purchase_date),
    receivedDate: dateOnly(row.received_date),
    status: row.status,
    discount,
    tax,
    shipping,
    subtotal,
    total: subtotal - discount + tax + shipping,
    notes: row.notes,
    itemLines: Number(row.item_lines),
    unitCount: Number(row.unit_count),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapReceiptItem(row: ReceiptItemRow) {
  return {
    id: row.id,
    barcode: row.barcode,
    product: row.product,
    material: row.material,
    color: row.color,
    packagingType: row.packaging_type,
    quantity: Number(row.quantity),
    unitWeightGrams: Number(row.unit_weight_grams),
    unitCost: Number(row.unit_cost),
    lineNumber: Number(row.line_number),
  };
}

function parseMoney(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) throw new Error(`${label} tidak valid.`);
  return amount;
}

export function parseReceiptInput(value: unknown): ReceiptInput {
  if (!value || typeof value !== "object") throw new Error("Data penerimaan tidak valid.");
  const input = value as Record<string, unknown>;
  const supplier = String(input.supplier ?? "").trim() as ReceiptInput["supplier"];
  const invoiceNumber = String(input.invoiceNumber ?? "").trim();
  const purchaseDate = String(input.purchaseDate ?? "").trim();
  const receivedDate = String(input.receivedDate ?? "").trim();
  const status = String(input.status ?? "") as ReceiptStatus;
  const discount = parseMoney(input.discount, "Diskon");
  const tax = parseMoney(input.tax, "Pajak");
  const shipping = parseMoney(input.shipping, "Ongkir");
  const notes = String(input.notes ?? "").trim();
  const rawItems = Array.isArray(input.items) ? input.items : [];

  if (!receiptSuppliers.includes(supplier)) throw new Error("Supplier tidak tersedia dalam daftar.");
  if (!invoiceNumber || invoiceNumber.length > 80) throw new Error("Nomor invoice wajib diisi, maksimal 80 karakter.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || Number.isNaN(Date.parse(`${purchaseDate}T00:00:00Z`))) throw new Error("Tanggal pembelian tidak valid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || Number.isNaN(Date.parse(`${receivedDate}T00:00:00Z`))) throw new Error("Tanggal diterima tidak valid.");
  if (!receiptStatuses.includes(status)) throw new Error("Status penerimaan tidak valid.");
  if (notes.length > 500) throw new Error("Catatan maksimal 500 karakter.");
  if (!rawItems.length || rawItems.length > 20) throw new Error("Tambahkan 1–20 produk yang diterima.");

  const items = rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object") throw new Error(`Produk ${index + 1} tidak valid.`);
    const item = rawItem as Record<string, unknown>;
    const barcode = String(item.barcode ?? "").trim();
    const product = String(item.product ?? "").trim();
    const material = String(item.material ?? "").trim().toUpperCase();
    const color = String(item.color ?? "").trim();
    const packagingType = String(item.packagingType ?? "") as ReceiptPackagingType;
    const quantity = Number(item.quantity);
    const unitWeightGrams = Number(item.unitWeightGrams);
    const unitCost = parseMoney(item.unitCost, `Harga produk ${index + 1}`);

    if (!barcode || barcode.length > 80) throw new Error(`Barcode produk ${index + 1} wajib diisi, maksimal 80 karakter.`);
    if (!product || product.length > 120) throw new Error(`Nama produk ${index + 1} wajib diisi.`);
    if (!material || material.length > 30) throw new Error(`Material produk ${index + 1} wajib diisi.`);
    if (!color || color.length > 60) throw new Error(`Warna produk ${index + 1} wajib diisi.`);
    if (!receiptPackagingTypes.includes(packagingType)) throw new Error(`Kemasan produk ${index + 1} tidak valid.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new Error(`Jumlah produk ${index + 1} harus 1–50 unit.`);
    if (!Number.isFinite(unitWeightGrams) || unitWeightGrams <= 0 || unitWeightGrams > 100_000) throw new Error(`Berat produk ${index + 1} tidak valid.`);

    return { barcode, product, material, color, packagingType, quantity, unitWeightGrams, unitCost };
  });

  if (new Set(items.map((item) => item.barcode)).size !== items.length) throw new Error("Barcode produk tidak boleh digunakan pada dua baris.");
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 200) throw new Error("Satu penerimaan maksimal 200 unit.");
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  if (subtotal - discount + tax + shipping < 0) throw new Error("Total landed cost tidak boleh negatif.");

  return { supplier, invoiceNumber, purchaseDate, receivedDate, status, discount, tax, shipping, notes, items };
}

type SqlClient = NeonQueryFunction<false, false>;

function receiptQuery(sql: SqlClient, id?: string) {
  return id
    ? sql`
        select r.*, coalesce(sum(i.quantity * i.unit_cost), 0) as subtotal,
          count(i.id)::int as item_lines, coalesce(sum(i.quantity), 0)::int as unit_count
        from goods_receipts r left join goods_receipt_items i on i.receipt_id = r.id
        where r.id = ${id}
        group by r.id
      `
    : sql`
        select r.*, coalesce(sum(i.quantity * i.unit_cost), 0) as subtotal,
          count(i.id)::int as item_lines, coalesce(sum(i.quantity), 0)::int as unit_count
        from goods_receipts r left join goods_receipt_items i on i.receipt_id = r.id
        group by r.id
        order by r.updated_at desc, r.receipt_number desc
      `;
}

export async function listReceipts() {
  await ensureReceiptSchema();
  const rows = await receiptQuery(getSql());
  return (rows as ReceiptRow[]).map(mapReceipt);
}

export async function getReceipt(id: string) {
  await ensureReceiptSchema();
  const sql = getSql();
  const rows = await receiptQuery(sql, id);
  if (!rows[0]) return null;
  const itemRows = await sql`select * from goods_receipt_items where receipt_id = ${id} order by line_number asc`;
  return { ...mapReceipt(rows[0] as ReceiptRow), items: (itemRows as ReceiptItemRow[]).map(mapReceiptItem) };
}

function receiptNumber(id: string, receivedDate: string) {
  const compactDate = receivedDate.replaceAll("-", "").slice(2);
  return `RCV-${compactDate}-${id.slice(0, 6).toUpperCase()}`;
}

function inventoryRows(receiptId: string, number: string, input: ReceiptInput, itemIds: string[]) {
  if (input.status !== "FINALIZED") return [];
  const totalUnits = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const adjustmentPerUnit = (input.tax + input.shipping - input.discount) / totalUnits;
  const month = input.receivedDate.replaceAll("-", "").slice(2, 6);
  const suffix = number.split("-").at(-1) ?? receiptId.slice(0, 6).toUpperCase();
  return input.items.flatMap((item, itemIndex) => Array.from({ length: item.quantity }, (_, unitIndex) => ({
    id: crypto.randomUUID(),
    receiptItemId: itemIds[itemIndex],
    code: `FLM-${month}-${suffix}-${String(itemIndex + 1).padStart(2, "0")}-${String(unitIndex + 1).padStart(2, "0")}`,
    product: item.product,
    material: item.material,
    color: item.color,
    packagingType: item.packagingType,
    remainingGrams: item.unitWeightGrams,
    unitCost: Math.max(0, Math.round((item.unitCost + adjustmentPerUnit) * 100) / 100),
    supplier: input.supplier,
  })));
}

async function assertGeneratedStockCanChange(sql: SqlClient, receiptId: string) {
  const rows = await sql`
    select count(*)::int as changed_count
    from inventory_items inv
    join goods_receipt_items line on line.id = inv.source_receipt_item_id
    where inv.source_receipt_id = ${receiptId}
      and (inv.status <> 'AVAILABLE' or inv.remaining_grams <> line.unit_weight_grams)
  `;
  if (Number(rows[0]?.changed_count ?? 0) > 0) throw new Error("Penerimaan tidak dapat diubah atau dihapus karena sebagian stoknya sudah digunakan.");
}

export async function createReceipt(input: ReceiptInput) {
  await ensureReceiptSchema();
  const sql = getSql();
  const id = crypto.randomUUID();
  const number = receiptNumber(id, input.receivedDate);
  const itemIds = input.items.map(() => crypto.randomUUID());
  const stockRows = inventoryRows(id, number, input, itemIds);
  const queries = [sql`
    insert into goods_receipts (id, receipt_number, supplier, invoice_number, purchase_date, received_date, status, discount, tax, shipping, notes)
    values (${id}, ${number}, ${input.supplier}, ${input.invoiceNumber}, ${input.purchaseDate}, ${input.receivedDate}, ${input.status}, ${input.discount}, ${input.tax}, ${input.shipping}, ${input.notes})
  `];
  input.items.forEach((item, index) => queries.push(sql`
    insert into goods_receipt_items (id, receipt_id, barcode, product, material, color, packaging_type, quantity, unit_weight_grams, unit_cost, line_number)
    values (${itemIds[index]}, ${id}, ${item.barcode}, ${item.product}, ${item.material}, ${item.color}, ${item.packagingType}, ${item.quantity}, ${item.unitWeightGrams}, ${item.unitCost}, ${index + 1})
  `));
  stockRows.forEach((item) => queries.push(sql`
    insert into inventory_items (id, code, product, material, color, packaging_type, remaining_grams, status, unit_cost, supplier, source_receipt_id, source_receipt_item_id)
    values (${item.id}, ${item.code}, ${item.product}, ${item.material}, ${item.color}, ${item.packagingType}, ${item.remainingGrams}, 'AVAILABLE', ${item.unitCost}, ${item.supplier}, ${id}, ${item.receiptItemId})
  `));
  await sql.transaction(queries);
  return getReceipt(id);
}

export async function updateReceipt(id: string, input: ReceiptInput) {
  await ensureReceiptSchema();
  const sql = getSql();
  const existing = await sql`select receipt_number from goods_receipts where id = ${id} limit 1`;
  if (!existing[0]) return null;
  await assertGeneratedStockCanChange(sql, id);
  const number = String(existing[0].receipt_number);
  const itemIds = input.items.map(() => crypto.randomUUID());
  const stockRows = inventoryRows(id, number, input, itemIds);
  const queries = [
    sql`delete from inventory_items where source_receipt_id = ${id}`,
    sql`delete from goods_receipt_items where receipt_id = ${id}`,
    sql`
      update goods_receipts
      set supplier = ${input.supplier}, invoice_number = ${input.invoiceNumber}, purchase_date = ${input.purchaseDate},
        received_date = ${input.receivedDate}, status = ${input.status}, discount = ${input.discount}, tax = ${input.tax},
        shipping = ${input.shipping}, notes = ${input.notes}, updated_at = now()
      where id = ${id}
    `,
  ];
  input.items.forEach((item, index) => queries.push(sql`
    insert into goods_receipt_items (id, receipt_id, barcode, product, material, color, packaging_type, quantity, unit_weight_grams, unit_cost, line_number)
    values (${itemIds[index]}, ${id}, ${item.barcode}, ${item.product}, ${item.material}, ${item.color}, ${item.packagingType}, ${item.quantity}, ${item.unitWeightGrams}, ${item.unitCost}, ${index + 1})
  `));
  stockRows.forEach((item) => queries.push(sql`
    insert into inventory_items (id, code, product, material, color, packaging_type, remaining_grams, status, unit_cost, supplier, source_receipt_id, source_receipt_item_id)
    values (${item.id}, ${item.code}, ${item.product}, ${item.material}, ${item.color}, ${item.packagingType}, ${item.remainingGrams}, 'AVAILABLE', ${item.unitCost}, ${item.supplier}, ${id}, ${item.receiptItemId})
  `));
  await sql.transaction(queries);
  return getReceipt(id);
}

export async function deleteReceipt(id: string) {
  await ensureReceiptSchema();
  const sql = getSql();
  const existing = await sql`select id from goods_receipts where id = ${id} limit 1`;
  if (!existing[0]) return false;
  await assertGeneratedStockCanChange(sql, id);
  await sql.transaction([
    sql`delete from inventory_items where source_receipt_id = ${id}`,
    sql`delete from goods_receipts where id = ${id}`,
  ]);
  return true;
}

