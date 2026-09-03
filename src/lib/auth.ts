import "server-only";
import { cookies } from "next/headers";
import { userForSession } from "./account-db";
import type { UserRole } from "./account-types";

export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-tidigo-session" : "tidigo-session";
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError(403, "Permintaan tidak diizinkan. Muat ulang halaman dan coba lagi.");
}
export async function currentUser() {
  return userForSession((await cookies()).get(sessionCookie)?.value);
}
export async function requireUser(request?: Request, allowedRoles?: readonly UserRole[]) {
  if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sesi berakhir. Silakan masuk kembali.");
  if (user.mustChangePassword) throw new AccessError(403, "Ganti kata sandi sementara sebelum melanjutkan.");
  if (allowedRoles && !allowedRoles.includes(user.role)) throw new AccessError(403, "Akun Anda tidak memiliki akses untuk tindakan ini.");
  return user;
}
export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) return Response.json({ message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ message: "Akun Anda tidak memiliki akses untuk tindakan ini." }, { status: 403 });
  return null;
}
