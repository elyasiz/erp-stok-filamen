import { cookies } from "next/headers";
import { AccessError, assertSameOrigin, accessErrorResponse, cookieOptions, sessionCookie } from "./auth";
import { consumeAuthAttempt, revokeSession, sessionLifetime } from "./account-db";
import type { AppUser } from "./account-types";

export async function authInput(request: Request) {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length")) > 8192) throw new AccessError(400, "Data tidak valid.");
  const raw = await request.text();
  if (raw.length > 8192) throw new AccessError(400, "Data tidak valid.");
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new AccessError(400, "Data tidak valid."); }
}
export async function limitAuthRequest(request: Request, purpose: string, limit = 60) {
  // Vercel overwrites this header; never trust arbitrary forwarded headers off-platform.
  const client = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
  await consumeAuthAttempt(`${purpose}:network:${client}`, limit);
}
export async function signedInResponse(result: { user: AppUser; token: string }) {
  const jar = await cookies();
  await revokeSession(jar.get(sessionCookie)?.value);
  jar.set(sessionCookie, result.token, { ...cookieOptions, maxAge: sessionLifetime });
  return Response.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
}
export function authenticationError(error: unknown) {
  const known = accessErrorResponse(error);
  if (known) return known;
  const reason = error instanceof Error ? error.message : "";
  if (reason === "TOO_MANY_ATTEMPTS") return Response.json({ message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } });
  if (reason === "INVALID_CREDENTIALS") return Response.json({ message: "Email atau kata sandi salah, atau akun tidak aktif." }, { status: 401 });
  if (reason === "SETUP_DENIED") return Response.json({ message: "Kode aktivasi tidak valid." }, { status: 403 });
  if (reason === "SETUP_CLOSED") return Response.json({ message: "Akun Owner sudah dibuat. Silakan masuk." }, { status: 409 });
  if (/^(Kata sandi harus|Pilih kata sandi|Nama harus|Masukkan alamat email|Email tidak valid)/.test(reason)) return Response.json({ message: reason }, { status: 400 });
  return Response.json({ message: "Permintaan belum berhasil. Silakan coba lagi." }, { status: 503 });
}
