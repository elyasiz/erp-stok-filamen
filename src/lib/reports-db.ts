import "server-only";
import { neon } from "@neondatabase/serverless";
import { ensureReceiptSchema } from "./receipts-db";
import { ensureUsageSchema } from "./usage-db";
import { buildReports, type ReportSnapshot } from "./report-data";

export async function getReports() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_NOT_CONFIGURED");
  await ensureReceiptSchema();
  await ensureUsageSchema();
  const sql = neon(databaseUrl);
  // One SELECT keeps stock balances and session totals in the same committed snapshot.
  const rows = await sql`
    select json_build_object(
      'inventory', (select coalesce(json_agg(i), '[]'::json) from inventory_items i),
      'receipts', (select coalesce(json_agg(r), '[]'::json) from goods_receipts r),
      'receiptItems', (select coalesce(json_agg(r), '[]'::json) from goods_receipt_items r),
      'sessions', (select coalesce(json_agg(s), '[]'::json) from usage_sessions s),
      'sessionItems', (select coalesce(json_agg(s), '[]'::json) from usage_session_items s)
    ) as snapshot
  `;
  return buildReports(rows[0].snapshot as ReportSnapshot);
}
