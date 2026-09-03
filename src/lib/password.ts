import "server-only";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

const parameters = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
const prefix = "scrypt$65536$8$2";
const dummy = `${prefix}$${"00".repeat(16)}$${"00".repeat(64)}`;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, "hex"), 64, parameters, (error, key) => error ? reject(error) : resolve(key)));
}
export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) throw new Error("Kata sandi harus 12–128 karakter.");
  return value;
}
export async function hashPassword(value: unknown) {
  const password = validatePassword(value);
  const salt = randomBytes(16).toString("hex");
  return `${prefix}$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(value: unknown, stored: unknown) {
  if (typeof value !== "string" || value.length > 128) return false;
  const valid = typeof stored === "string" && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored);
  const parts = (valid ? stored as string : dummy).split("$");
  const actual = await derive(value, parts[4]);
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex")) && valid;
}
export function equalSecret(actual: unknown, expected: string | undefined) {
  if (typeof actual !== "string" || actual.length > 256 || !expected || expected.length < 32) return false;
  return timingSafeEqual(createHash("sha256").update(actual).digest(), createHash("sha256").update(expected).digest());
}
