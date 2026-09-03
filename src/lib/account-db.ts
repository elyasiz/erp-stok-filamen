import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { accountSql, ensureAuditSchema } from "./audit-db";
import { roles, type AppUser, type Actor, type UserRole } from "./account-types";
import { equalSecret, hashPassword, validatePassword, verifyPassword } from "./password";

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
      role text not null check(role in ('OWNER','ADMIN','COACH')),
      status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
      avatar_url text, last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    )`;
    await sql`alter table app_users add column if not exists password_hash text`;
    await sql`alter table app_users add column if not exists must_change_password boolean not null default false`;
    await sql`create table if not exists account_guard (id integer primary key check(id = 1))`;
    await sql`alter table account_guard add column if not exists bootstrapped boolean not null default false`;
    await sql`insert into account_guard(id) values(1) on conflict do nothing`;
    await sql`update account_guard set bootstrapped=true where id=1 and exists(select 1 from app_users where role='OWNER')`;
    await sql`create table if not exists app_sessions (
      token_hash text primary key, user_id uuid not null references app_users(id),
      expires_at timestamptz not null, created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_sessions_user_idx on app_sessions(user_id)`;
    await sql`create index if not exists app_sessions_expiry_idx on app_sessions(expires_at)`;
    await sql`create table if not exists auth_attempts (key_hash text primary key, attempts integer not null, window_start timestamptz not null default now())`;
  })().catch(error => { ready = null; throw error; });
  await ready;
}
function mapUser(row: Record<string, unknown>): AppUser {
  return { id: String(row.id), email: String(row.email), name: String(row.name), role: row.role as UserRole, status: row.status as AppUser["status"], avatarUrl: row.avatar_url ? String(row.avatar_url) : null, lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null, createdAt: new Date(String(row.created_at)).toISOString(), mustChangePassword: Boolean(row.must_change_password) };
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
  return { email, name, role, password: validatePassword(data.password) };
}
export async function createUser(input: ReturnType<typeof parseUser>, actor: Actor) {
  if (actor.role !== "OWNER") throw new Error("FORBIDDEN");
  await ensureAccountSchema();
  const sql = accountSql();
  const passwordHash = await hashPassword(input.password);
  const rows = await sql`with added as (
    insert into app_users(id,email,name,role,password_hash,must_change_password) values(${crypto.randomUUID()},${input.email},${input.name},${input.role},${passwordHash},true) returning *
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
  const resetPassword = data.password !== undefined && data.password !== "";
  if (resetPassword && id === actor.id) throw new Error("Gunakan Ubah kata sandi di profil untuk akun sendiri.");
  const passwordHash = resetPassword ? await hashPassword(data.password) : null;
  await ensureAccountSchema();
  const sql = accountSql();
  const rows = await sql`with locked as (select id from account_guard where id = 1 for update), previous as (
    select u.* from app_users u, locked where u.id = ${id} for update of u
  ), changed as (
    update app_users u set name = ${name}, role = ${role}, status = ${String(status)}, updated_at = now(),
      password_hash = coalesce(${passwordHash},u.password_hash), must_change_password = case when ${resetPassword} then true else u.must_change_password end
    from previous p where u.id = p.id and (
      p.role <> 'OWNER' or (${role} = 'OWNER' and ${String(status)} = 'ACTIVE')
    ) returning u.*
  ), revoked as (delete from app_sessions s using changed c where s.user_id = c.id and (${resetPassword} or c.status = 'DISABLED' or c.role <> (select role from previous)) returning s.user_id), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id,before_data,after_data)
    select ${crypto.randomUUID()},${actor.id},${actor.name},${resetPassword ? "PASSWORD_RESET" : "USER_UPDATED"},'user',c.id::text,
      jsonb_build_object('name',p.name,'role',p.role,'status',p.status),jsonb_build_object('name',c.name,'role',c.role,'status',c.status)
    from changed c, previous p returning id
  ) select changed.* from changed, logged`;
  if (!rows[0]) throw new Error("Akun tidak ditemukan atau peran dan status Owner dilindungi.");
  return mapUser(rows[0]);
}
export async function accountSetupStatus() {
  if (!process.env.DATABASE_URL) return { configured: false, setupRequired: true };
  await ensureAccountSchema();
  const [guard] = await accountSql()`select bootstrapped from account_guard where id=1`;
  return { configured: Boolean(guard.bootstrapped || (process.env.AUTH_SETUP_TOKEN?.length ?? 0) >= 32), setupRequired: !guard.bootstrapped };
}
export async function bootstrapOwner(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("SETUP_DENIED");
  const data = value as Record<string, unknown>;
  if (!equalSecret(data.setupToken, process.env.AUTH_SETUP_TOKEN)) throw new Error("SETUP_DENIED");
  const input = parseUser({ ...data, role: "OWNER" });
  const passwordHash = await hashPassword(input.password);
  await ensureAccountSchema();
  const sql = accountSql();
  // Updating this singleton is the atomic claim: simultaneous setup requests cannot both win.
  const rows = await sql`with claimed as (
    update account_guard set bootstrapped=true where id=1 and bootstrapped=false
      and not exists(select 1 from app_users where role='OWNER') returning id
  ), added as (
    insert into app_users(id,email,name,role,password_hash,must_change_password)
    select ${crypto.randomUUID()},${input.email},${input.name},'OWNER',${passwordHash},false from claimed returning *
  ), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id)
    select ${crypto.randomUUID()},id,name,'OWNER_CREATED','user',id::text from added returning id
  ) select added.* from added, logged`;
  if (!rows[0]) throw new Error("SETUP_CLOSED");
  return mapUser(rows[0]);
}
export async function consumeAuthAttempt(key: string, limit: number) {
  await ensureAccountSchema();
  const sql = accountSql();
  await sql`delete from auth_attempts where window_start < now() - interval '1 day'`;
  const [row] = await sql`insert into auth_attempts(key_hash,attempts) values(${tokenHash(key)},1)
    on conflict(key_hash) do update set
      attempts = case when auth_attempts.window_start <= now() - interval '15 minutes' then 1 else auth_attempts.attempts+1 end,
      window_start = case when auth_attempts.window_start <= now() - interval '15 minutes' then now() else auth_attempts.window_start end
    returning attempts`;
  if (Number(row.attempts) > limit) throw new Error("TOO_MANY_ATTEMPTS");
}
async function createSession(id: string, passwordHash: string) {
  const sql = accountSql();
  const token = randomBytes(32).toString("base64url");
  await sql`delete from app_sessions where expires_at <= now()`;
  // The credential must still match after verification (a concurrent reset can revoke it).
  const rows = await sql`with active_user as (
    select * from app_users where id=${id} and status='ACTIVE' and password_hash=${passwordHash} for update
  ), created as (
    insert into app_sessions(token_hash,user_id,expires_at)
    select ${tokenHash(token)},id,now()+${sessionLifetime}*interval '1 second' from active_user returning user_id
  ), touched as (
    update app_users u set last_login_at=now() from created where u.id=created.user_id returning u.*
  ), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id)
    select ${crypto.randomUUID()},id,name,'LOGIN','user',id::text from touched returning id
  ) select touched.* from touched, logged`;
  if (!rows[0]) throw new Error("INVALID_CREDENTIALS");
  return { user: mapUser(rows[0]), token };
}
export async function signInPassword(emailValue: unknown, password: unknown) {
  let email: string;
  try { email = normalizeEmail(emailValue); } catch { throw new Error("INVALID_CREDENTIALS"); }
  await consumeAuthAttempt(`login:email:${email}`, 10);
  const [row] = await accountSql()`select * from app_users where email=${email}`;
  const valid = await verifyPassword(password, row?.password_hash);
  if (!valid || row?.status !== "ACTIVE") throw new Error("INVALID_CREDENTIALS");
  const result = await createSession(String(row.id), String(row.password_hash));
  await accountSql()`delete from auth_attempts where key_hash=${tokenHash(`login:email:${email}`)}`;
  return result;
}
export async function changePassword(user: AppUser, currentPassword: unknown, newPassword: unknown) {
  await consumeAuthAttempt(`password:user:${user.id}`, 10);
  const sql = accountSql();
  const [previous] = await sql`select password_hash from app_users where id=${user.id} and status='ACTIVE'`;
  if (!await verifyPassword(currentPassword, previous?.password_hash)) throw new Error("INVALID_CREDENTIALS");
  if (currentPassword === newPassword) throw new Error("Pilih kata sandi baru yang berbeda.");
  const passwordHash = await hashPassword(newPassword);
  const rows = await sql`with changed as (
    update app_users set password_hash=${passwordHash},must_change_password=false,updated_at=now()
    where id=${user.id} and status='ACTIVE' and password_hash=${previous.password_hash} returning *
  ), revoked as (
    delete from app_sessions using changed where user_id=changed.id returning user_id
  ), logged as (
    insert into audit_events(id,actor_user_id,actor_name,action,entity_type,entity_id)
    select ${crypto.randomUUID()},id,name,'PASSWORD_CHANGED','user',id::text from changed returning id
  ) select changed.* from changed, logged`;
  if (!rows[0]) throw new Error("INVALID_CREDENTIALS");
  return createSession(user.id, passwordHash);
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
