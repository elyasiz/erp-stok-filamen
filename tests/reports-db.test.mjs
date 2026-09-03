import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

let db, reports, helpers;
before(async () => {
  db = new PGlite();
  const sql = async (parts, ...values) => (await db.query(parts.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, ""), values)).rows;
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const loadedModule = { exports: {} };
    cache.set(name, loadedModule.exports);
    const source = ts.transpileModule(readFileSync(resolve("src/lib", `${name}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports: loadedModule.exports, require: (dependency) => {
      if (dependency === "server-only") return {};
      if (dependency === "@neondatabase/serverless") return { neon: () => sql };
      if (dependency.startsWith("./")) return load(dependency.slice(2));
      throw new Error(`Unexpected dependency ${dependency}`);
    }, process: { env: { DATABASE_URL: "in-memory-test-only" } }, crypto: { randomUUID }, Date, Intl });
    return loadedModule.exports;
  }
  reports = load("reports-db");
  helpers = load("report-data");
  await reports.getReports();
});
beforeEach(async () => { await db.exec("TRUNCATE usage_session_items, usage_sessions, inventory_items, goods_receipt_items, goods_receipts CASCADE"); });
after(async () => { await db.close(); });

async function stock({ weight = 1000, status = "AVAILABLE", price = 100000, code = `FLM-${randomUUID().slice(0, 8)}`, receiptId = null, lineId = null } = {}) {
  const id = randomUUID();
  await db.query(`INSERT INTO inventory_items (id, code, product, material, color, packaging_type, remaining_grams, status, unit_cost, supplier, source_receipt_id, source_receipt_item_id)
    VALUES ($1, $2, 'PLA, Basic', 'PLA', 'White', 'WITH_SPOOL', $3, $4, $5, 'Supplier', $6, $7)`, [id, code, weight, status, price, receiptId, lineId]);
  return id;
}
async function receipt(status = "FINALIZED", weight = 2000, quantity = 1) {
  const id = randomUUID(), lineId = randomUUID();
  await db.query(`INSERT INTO goods_receipts (id, receipt_number, supplier, invoice_number, purchase_date, received_date, status, discount, tax, shipping)
    VALUES ($1, $2, 'Supplier', 'Invoice', '2026-08-31', '2026-09-01', $3, 10000, 11000, 15000)`, [id, `RCV-${id}`, status]);
  await db.query(`INSERT INTO goods_receipt_items (id, receipt_id, barcode, product, material, color, packaging_type, quantity, unit_weight_grams, unit_cost, line_number)
    VALUES ($1, $2, 'BARCODE', 'PLA', 'PLA', 'White', 'WITH_SPOOL', $3, $4, 200000, 1)`, [lineId, id, quantity, weight]);
  return { receiptId: id, lineId };
}
async function session(inventoryId, { status = "COMPLETED", used = 100, category = "CLASS", completed = "2026-08-31T17:30:00Z" } = {}) {
  const id = randomUUID();
  await db.query(`INSERT INTO usage_sessions (id, usage_number, user_name, usage_type, non_class_type, status, started_at, completed_at, result, notes)
    VALUES ($1, $2, 'Nama Asli', $3, $4, $5, '2026-08-31T16:30:00Z', $6, $7, 'Catatan tersimpan')`, [id, `USE-${id}`, category === "CLASS" ? "CLASS" : "NON_CLASS", category === "CLASS" ? null : category, status, status === "COMPLETED" ? completed : null, status === "COMPLETED" ? "SUCCESS" : null]);
  await db.query(`INSERT INTO usage_session_items (session_id, inventory_item_id, starting_grams, used_grams, returned_grams)
    VALUES ($1, $2, 1000, $3, $4)`, [id, inventoryId, status === "COMPLETED" ? used : null, status === "COMPLETED" ? 1000 - used : null]);
  return id;
}

test("empty database yields zero totals and no invented transactions", async () => {
  const data = await reports.getReports();
  assert.equal(data.summary.totalUnits, 0);
  assert.equal(data.summary.totalGrams, 0);
  for (const key of ["inventory", "receipts", "usages", "movements", "activities", "activeSessions", "lowStock"]) assert.equal(data[key].length, 0);
  assert.equal(helpers.usageTotals(data.usages).estimatedCost, 0);
});

test("stock metrics follow stored decimal balances, status and edits; manual stock creates no fake ledger", async () => {
  const id = await stock({ weight: 986.35 });
  await stock({ weight: 499.99, status: "IN_USE" });
  await stock({ weight: 500 });
  await stock({ weight: 0, status: "EMPTY" });
  const first = await reports.getReports();
  assert.equal(first.summary.totalUnits, 4);
  assert.equal(first.summary.totalGrams, 1986.34);
  assert.equal(first.summary.available, 2);
  assert.equal(first.summary.inUse, 1);
  assert.equal(first.lowStock.length, 1);
  assert.equal(first.summary.healthyPercent, 50);
  assert.equal(first.movements.length, 0);
  await db.query("UPDATE inventory_items SET remaining_grams=100 WHERE id=$1", [id]);
  const next = await reports.getReports();
  assert.equal(next.summary.totalGrams, 1099.99);
  assert.equal(next.lowStock.length, 2);
});

test("receipt totals include adjustments once, draft stays separate, and movement uses initial weight", async () => {
  const source = await receipt("FINALIZED", 2000, 2);
  await stock({ ...source, weight: 1500, price: 208000 });
  await stock({ ...source, weight: 2000, price: 208000 });
  await receipt("DRAFT", 1000, 9);
  const data = await reports.getReports();
  const final = data.receipts.find((row) => row.status === "FINALIZED");
  assert.equal(final.unitCount, 2);
  assert.equal(final.totalGrams, 4000);
  assert.equal(final.total, 416000);
  assert.equal(data.movements.length, 2);
  assert.equal(data.movements[0].after, 2000);
  assert.equal(data.movements[0].user, null);
  assert.equal(data.activities.filter((row) => row.kind === "receipt").length, 1);
});

test("completed usage uses WIB completion month and real consumption; active sessions are not spent grams", async () => {
  const source = await receipt();
  const stockId = await stock({ ...source, weight: 900, price: 200000 });
  await session(stockId, { used: 100, category: "TRIAL_PRINT" });
  const activeId = await stock({ weight: 1000, status: "IN_USE" });
  await session(activeId, { status: "ACTIVE" });
  const data = await reports.getReports();
  const september = helpers.filterReportPeriod(data, "2026-09");
  const august = helpers.filterReportPeriod(data, "2026-08");
  assert.equal(september.usages.length, 1);
  assert.equal(august.usages.length, 1);
  assert.equal(data.activeSessions.length, 1);
  assert.equal(data.activeSessions[0].totalUsedGrams, null);
  const totals = helpers.usageTotals(september.usages);
  assert.equal(totals.grams, 100);
  assert.equal(totals.estimatedCost, 10000); // 100g / recorded 2000g, never / remaining 900g.
  assert.equal(september.usages[0].category, "Trial Print");
  const movement = data.movements.find((row) => row.type === "Penggunaan");
  assert.equal(movement.before, 1000);
  assert.equal(movement.change, -100);
  assert.equal(movement.after, 900);
  assert.equal(movement.user, "Nama Asli");
});

test("unknown original weight produces missing cost, never an invented 1000g cost basis", async () => {
  await session(await stock({ weight: 700 }), { used: 300, category: "SAMPLE" });
  const data = await reports.getReports();
  const totals = helpers.usageTotals(data.usages);
  assert.equal(totals.grams, 300);
  assert.equal(totals.estimatedCost, null);
  assert.equal(totals.incompleteCostCount, 1);
});

test("CSV preserves decimals, embedded separators, quotes and newlines and neutralizes text formulas", () => {
  const csv = helpers.toCsv([["Produk", "Gram"], ['PLA, "Basic"\nWhite', 986.35], ["=HYPERLINK(x)", -13.65], [null, 0]]);
  assert.ok(csv.startsWith('\uFEFF"Produk","Gram"\r\n'));
  assert.ok(csv.includes('"PLA, ""Basic""\nWhite","986.35"'));
  assert.ok(csv.includes('"\'=HYPERLINK(x)","-13.65"'));
  assert.ok(csv.endsWith('"","0"'));
});
