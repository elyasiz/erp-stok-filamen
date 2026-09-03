import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

// Execute the application's actual PostgreSQL statements in an isolated, in-memory database.
// No production credentials or network connections are used by this test suite.
let db;
let usage;
before(async () => {
  db = new PGlite();
  const sql = async (parts, ...values) => {
    const query = parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return (await db.query(query, values)).rows;
  };
  const loadedModule = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/usage-db.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports: loadedModule.exports,
    require: (name) => {
      if (name === "server-only") return {};
      if (name === "@neondatabase/serverless") return { neon: () => sql };
      if (name === "./audit-db") {
        const audit = { exports: {} };
        const source = ts.transpileModule(readFileSync(resolve("src/lib/audit-db.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        runInNewContext(source, { exports: audit.exports, require: dependency => dependency === "server-only" ? {} : { neon: () => sql }, process: { env: { DATABASE_URL: "in-memory-test-only" } }, Date });
        return audit.exports;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { DATABASE_URL: "in-memory-test-only" } },
    crypto: { randomUUID },
    Date,
    Intl,
  });
  usage = loadedModule.exports;
  await usage.listActiveUsageSessions();
});
beforeEach(async () => { await db.exec("TRUNCATE usage_session_items, usage_sessions, inventory_items CASCADE"); });
after(async () => { await db.close(); });

async function stock(weights = [1000, 700], statuses = []) {
  const items = [];
  for (const [index, weight] of weights.entries()) {
    const item = { id: randomUUID(), code: `FLM-TEST-${index + 1}`, weight };
    await db.query(`INSERT INTO inventory_items (id, code, product, material, color, packaging_type, remaining_grams, status, unit_cost, supplier)
      VALUES ($1, $2, 'Test filament', 'PLA', 'White', 'WITH_SPOOL', $3, $4, 100000, 'Test supplier')`, [item.id, item.code, weight, statuses[index] ?? "AVAILABLE"]);
    items.push(item);
  }
  return items;
}
async function start(items, overrides = {}) {
  return usage.createUsageSession(usage.parseUsageInput({ userName: "Test Pengambil", usageType: "CLASS", inventoryItemIds: items.map((item) => item.id), ...overrides }));
}
function completion(items, amounts, overrides = {}) {
  return usage.parseUsageCompletionInput({ result: "SUCCESS", notes: "Selesai diuji", items: items.map((item, index) => ({ inventoryItemId: item.id, barcode: item.code, usedGrams: amounts[index] })), ...overrides });
}
async function balances() {
  return (await db.query("SELECT code, remaining_grams::text AS grams, status FROM inventory_items ORDER BY code")).rows;
}

test("start and barcode lookup use the original session and borrower", async () => {
  const items = await stock();
  const session = await start(items, { usageType: "NON_CLASS", nonClassType: "SAMPLE" });
  const found = await usage.findActiveUsageByBarcode(items[1].code.toLowerCase());
  assert.equal(found.id, session.id);
  assert.equal(found.userName, "Test Pengambil");
  assert.equal(found.nonClassType, "SAMPLE");
  assert.equal(found.items.length, 2);
  assert.equal(found.items[0].startingGrams, 1000);
  assert.deepEqual((await balances()).map((row) => row.status), ["IN_USE", "IN_USE"]);
});

test("complete updates every balance, saves results, preserves barcodes and closes the session", async () => {
  const items = await stock([1000, 700, 50]);
  const session = await start(items);
  const closed = await usage.completeUsageSession(session.id, completion(items, [125.5, 300, 50]));
  assert.equal(closed.status, "COMPLETED");
  assert.equal(closed.result, "SUCCESS");
  assert.equal(closed.notes, "Selesai diuji");
  assert.ok(closed.completedAt);
  assert.equal(closed.totalUsedGrams, 475.5);
  assert.equal(closed.totalReturnedGrams, 1274.5);
  assert.deepEqual(await balances(), [
    { code: items[0].code, grams: "874.50", status: "AVAILABLE" },
    { code: items[1].code, grams: "400.00", status: "LOW_STOCK" },
    { code: items[2].code, grams: "0.00", status: "EMPTY" },
  ]);
  assert.equal((await usage.listActiveUsageSessions()).length, 0);
  assert.equal(await usage.findActiveUsageByBarcode(items[0].code), null);
});

test("repeating finalization never deducts stock twice", async () => {
  const items = await stock([1000]);
  const session = await start(items);
  const input = completion(items, [100]);
  await usage.completeUsageSession(session.id, input);
  await assert.rejects(usage.completeUsageSession(session.id, input), /USAGE_ALREADY_COMPLETED/);
  assert.equal((await balances())[0].grams, "900.00");
});

test("missing, foreign, wrong-barcode and excessive-gram items reject the entire operation", async () => {
  const items = await stock();
  const session = await start(items);
  const baseline = await balances();
  const normal = completion(items, [10, 20]);
  const cases = [
    { ...normal, items: normal.items.slice(0, 1) },
    { ...normal, items: [{ ...normal.items[0], barcode: "WRONG-CODE" }, normal.items[1]] },
    { ...normal, items: [{ ...normal.items[0], inventoryItemId: randomUUID() }, normal.items[1]] },
    completion(items, [10, 701]),
  ];
  for (const input of cases) {
    await assert.rejects(usage.completeUsageSession(session.id, input), /USAGE_COMPLETION_CONFLICT/);
    assert.deepEqual(await balances(), baseline);
    const current = await usage.getUsageSession(session.id);
    assert.equal(current.status, "ACTIVE");
    assert.equal(current.items[0].usedGrams, null);
  }
});

test("validation rejects empty, negative, nonfinite, imprecise and duplicate input", () => {
  const item = { inventoryItemId: randomUUID(), barcode: "FLM-TEST-1", usedGrams: 1 };
  for (const usedGrams of ["", null, "12", -1, NaN, Infinity, 0.001, 100001]) {
    assert.throws(() => usage.parseUsageCompletionInput({ result: "SUCCESS", items: [{ ...item, usedGrams }] }), /Gram digunakan/);
  }
  assert.throws(() => usage.parseUsageCompletionInput({ result: "SUCCESS", items: [item, item] }), /dua kali/);
  assert.throws(() => usage.parseUsageCompletionInput({ result: "OTHER", items: [item] }), /hasil pekerjaan/);
  assert.throws(() => usage.parseUsageCompletionInput({ result: "SUCCESS", items: [] }), /Seluruh unit/);
  assert.throws(() => usage.parseUsageCompletionInput({ result: "SUCCESS", items: [{ ...item, barcode: "" }] }), /Scan ulang/);
  assert.throws(() => usage.parseUsageCompletionInput({ result: "SUCCESS", notes: "x".repeat(1001), items: [item] }), /Catatan/);
});

test("explicit zero usage preserves balances and uses the exact low-stock boundary", async () => {
  const items = await stock([500, 499.99]);
  const session = await start(items);
  const closed = await usage.completeUsageSession(session.id, completion(items, [0, 0], { result: "CANCELLED" }));
  assert.equal(closed.result, "CANCELLED");
  assert.equal(closed.totalUsedGrams, 0);
  assert.deepEqual((await balances()).map((row) => row.status), ["AVAILABLE", "LOW_STOCK"]);
});

test("changed inventory cannot be silently overwritten by finalization", async () => {
  const items = await stock();
  const session = await start(items);
  await db.query("UPDATE inventory_items SET remaining_grams = 999 WHERE id = $1", [items[0].id]);
  const baseline = await balances();
  await assert.rejects(usage.completeUsageSession(session.id, completion(items, [10, 20])), /USAGE_COMPLETION_CONFLICT/);
  assert.deepEqual(await balances(), baseline);
});

test("a database error rolls back inventory, per-unit amounts and session changes together", async () => {
  const items = await stock();
  const session = await start(items);
  const baseline = await balances();
  await db.exec(`CREATE FUNCTION test_reject_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'COMPLETED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_close BEFORE UPDATE ON usage_sessions FOR EACH ROW EXECUTE FUNCTION test_reject_close();`);
  try {
    await assert.rejects(usage.completeUsageSession(session.id, completion(items, [10, 20])), /test rollback/);
    assert.deepEqual(await balances(), baseline);
    assert.equal((await usage.getUsageSession(session.id)).items[0].usedGrams, null);
    assert.equal((await usage.getUsageSession(session.id)).status, "ACTIVE");
  } finally { await db.exec("DROP TRIGGER test_reject_close ON usage_sessions; DROP FUNCTION test_reject_close()"); }
});

test("two finalization requests produce one successful deduction", async () => {
  const items = await stock([1000]);
  const session = await start(items);
  const input = completion(items, [100]);
  const results = await Promise.allSettled([usage.completeUsageSession(session.id, input), usage.completeUsageSession(session.id, input)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await balances())[0].grams, "900.00");
});

test("a unit linked to an active session cannot be taken again, even after manual status changes", async () => {
  const items = await stock([1000]);
  await start(items);
  await assert.rejects(start(items), /UNIT_NOT_AVAILABLE/);
  await db.query("UPDATE inventory_items SET status = 'AVAILABLE' WHERE id = $1", [items[0].id]);
  await assert.rejects(start(items), /UNIT_NOT_AVAILABLE/);
  assert.equal((await usage.listActiveUsageSessions()).length, 1);
});

test("finished units can be used in a new session with their new starting balance", async () => {
  const items = await stock([1000]);
  const first = await start(items);
  await usage.completeUsageSession(first.id, completion(items, [200]));
  const second = await start(items);
  assert.equal(second.items[0].startingGrams, 800);
  assert.notEqual(second.id, first.id);
  assert.equal((await usage.getUsageSession(first.id)).items[0].returnedGrams, 800);
});
