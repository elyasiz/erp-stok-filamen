import "server-only";
import { neon } from "@neondatabase/serverless";
import type { AuditEvent } from "./account-types";

let ready: Promise<void> | null = null;
export function accountSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(process.env.DATABASE_URL);
}
export async function ensureAuditSchema() {
  if (!ready) ready = (async () => {
    const sql = accountSql();
    await sql`create table if not exists audit_events (
      id uuid primary key, actor_user_id uuid, actor_name text not null,
      action text not null, entity_type text not null, entity_id text not null,
      reason text not null default '', before_data jsonb, after_data jsonb,
      created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists audit_events_time_idx on audit_events (created_at desc)`;
  })().catch(error => { ready = null; throw error; });
  await ready;
}
export async function listAuditEvents(): Promise<AuditEvent[]> {
  await ensureAuditSchema();
  const rows = await accountSql()`select * from audit_events order by created_at desc, id desc limit 200`;
  return rows.map(row => ({ id: row.id, actorName: row.actor_name, action: row.action, entityType: row.entity_type, entityId: row.entity_id, reason: row.reason, before: row.before_data, after: row.after_data, createdAt: new Date(row.created_at).toISOString() }));
}
