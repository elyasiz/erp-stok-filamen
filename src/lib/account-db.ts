import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { accountSql, ensureAuditSchema } from "./audit-db";
import { roles, type AppUser, type Actor, type UserRole } from "./account-types";

let ready: Promise<void> | null = null;
export const sessionLifetime = 60 * 60 * 12;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new Error("Email tidak valid.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Masukkan alamat email yang valid.");
  return email;
}
export async function ensureAccountSchema() {
  if (!ready) ready = (async () => {
    await ensureAuditSchema();
    const sql = accountSql();
    await sql`create table if not exists app_users (
      id uuid primary key, email text not null unique check(email = lower(email)), name text not null,
      google_sub text unique, role text not null check(role in ('OWNER','ADMIN','COACH')),
      status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
      avatar_url text, last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists account_guard (id integer primary key check(id = 1))`;
    await sql`insert into account_guard(id) values(1) on conflict do nothing`;
    await sql`create table if not exists app_sessions (
      token_hash text primary key, user_id uuid not null references app_users(id),
      expires_at timestamptz not null, created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_sessions_user_idx on app_sessions(user_id)`;
    await sql`create index if not exists app_sessions_expiry_idx on app_sessions(expires_at)`;
  })().catch(error => { ready = null; throw error; });
  await ready;
}
function mapUser(row: Record<string, unknown>): AppUser {
  return { id: String(row.id), email: String(row.email), name: String(row.name), role: row.role as UserRole, status: row.status as AppUser["status"], avatarUrl: row.avatar_url ? String(row.avatar_url) : null, lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null, createdAt: new Date(String(row.created_at)).toISOString(), linked: Boolean(row.google_sub) };
}
export async function listUsers() {
  await ensureAccountSchema();
  return (await accountSql()`select * from app_users order by name, email`).map(mapUser);
}
export async function getUser(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensureAccountSchema();
  const rows = await accountSql()`select * from app_users where id = ${id}`;
  return rows[0] ? mapUser(rows[0]) : null;
}
export function parseUser(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Data akun tidak valid.");
  const data = value as Record<string, unknown>;
  const email = normalizeEmail(data.email);
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const role = data.role as UserRole;
  if (name.length < 2 || name.length > 120) throw new Error("Nama harus 2–120 karakter.");
  if (!roles.includes(role)) throw new Error("Peran tidak valid.");
  return { email, name, role };
}
export async function createUser(input: ReturnType<typeof parseUser>, actor: Actor) {
  if (actor.role !== "OWNER") throw new Error("FORBIDDEN");
  await ensureAccountSchema();
  const sql = accountSql();
  const rows = await sql`with added as (
    insert into app_users(id,email,name,role) values(${crypto.randomUUID()},${input.email},${input.name},${input.role}) returning *
  ), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data)
    select ${crypto.randomUUID()},${actor.id},${actor.name},'USER_CREATED','user',id::text,jsonb_build_object('name',name,'email',email,'role',role,'status',status) from added returning id
  ) select added.* from added, logged`;
  return mapUser(rows[0]);
}
export async function updateUser(id: string, value: unknown, actor: Actor) {
  if (actor.role !== "OWNER") throw new Error("FORBIDDEN");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !value || typeof value !== "object") throw new Error("Data akun tidak valid.");
  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const role = data.role as UserRole;
  const status = data.status;
  if (name.length < 2 || name.length > 120 || !roles.includes(role) || !["ACTIVE", "DISABLED"].includes(String(status))) throw new Error("Nama, peran, atau status akun tidak valid.");
  if (id === actor.id && (role !== "OWNER" || status !== "ACTIVE")) throw new Error("Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.");
  await ensureAccountSchema();
  const sql = accountSql();
  const rows = await sql`with locked as (select id from account_guard where id = 1 for update), previous as (
    select u.* from app_users u, locked where u.id = ${id} for update of u
  ), changed as (
    update app_users u set name = ${name}, role = ${role}, status = ${String(status)}, updated_at = now()
    from previous p where u.id = p.id and (
      p.role <> 'OWNER' or (${role} = 'OWNER' and ${String(status)} = 'ACTIVE')
    ) returning u.*
  ), revoked as (delete from app_sessions s using changed c where s.user_id = c.id and (c.status = 'DISABLED' or c.role <> (select role from previous)) returning s.user_id), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,before_data,after_data)
    select ${crypto.randomUUID()},${actor.id},${actor.name},'USER_UPDATED','user',c.id::text,
      jsonb_build_object('name',p.name,'role',p.role,'status',p.status),jsonb_build_object('name',c.name,'role',c.role,'status',c.status)
    from changed c, previous p returning id
  ) select changed.* from changed, logged`;
  if (!rows[0]) throw new Error("Akun tidak ditemukan atau peran dan status Owner dilindungi.");
  return mapUser(rows[0]);
}
export async function signInGoogle(identity: { sub: string; email: string; name: string; picture?: string; authoritativeEmail: boolean }) {
  await ensureAccountSchema();
  const sql = accountSql();
  const email = normalizeEmail(identity.email);
  const ownerEmail = process.env.AUTH_OWNER_EMAIL?.trim().toLowerCase();
  // The configured owner is bootstrapped once. Every later user must be registered by an Owner.
  if (ownerEmail === email && identity.authoritativeEmail) {
    await sql`with locked as (select id from account_guard where id=1 for update)
      insert into app_users(id,email,name,google_sub,role)
      select ${crypto.randomUUID()},${email},${identity.name.slice(0,120) || email},${identity.sub},'OWNER' from locked
      where not exists(select 1 from app_users where role='OWNER') on conflict do nothing`;
  }
  const rows = await sql`update app_users set google_sub = ${identity.sub},
      avatar_url = ${identity.picture?.startsWith("https://") ? identity.picture : null}, last_login_at = now(), updated_at = now()
    where status = 'ACTIVE' and (google_sub = ${identity.sub} or (google_sub is null and email = ${email} and ${identity.authoritativeEmail})) returning *`;
  if (!rows[0]) throw new Error("ACCOUNT_NOT_ALLOWED");
  const user = mapUser(rows[0]);
  const token = randomBytes(32).toString("base64url");
  // Store only a digest; a database read cannot reveal usable login cookies.
  await sql.transaction([
    sql`delete from app_sessions where expires_at <= now()`,
    sql`insert into app_sessions(token_hash,user_id,expires_at) select ${tokenHash(token)},id,now() + ${sessionLifetime} * interval '1 second' from app_users where id=${user.id} and status='ACTIVE'`,
    sql`insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id) values(${crypto.randomUUID()},${user.id},${user.name},'LOGIN','user',${user.id})`,
  ]);
  return { user, token };
}
export async function userForSession(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  await ensureAccountSchema();
  const rows = await accountSql()`select u.* from app_sessions s join app_users u on u.id=s.user_id
    where s.token_hash=${tokenHash(token)} and s.expires_at > now() and u.status='ACTIVE'`;
  return rows[0] ? mapUser(rows[0]) : null;
}
export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await ensureAccountSchema();
  await accountSql()`delete from app_sessions where token_hash=${tokenHash(token)}`;
}
