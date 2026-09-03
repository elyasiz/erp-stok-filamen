import "server-only";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { userForSession } from "./account-db";
import type { UserRole } from "./account-types";

export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-tidigo-session" : "tidigo-session";
export const nonceCookie = process.env.NODE_ENV === "production" ? "__Host-tidigo-nonce" : "tidigo-nonce";
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
  if (allowedRoles && !allowedRoles.includes(user.role)) throw new AccessError(403, "Akun Anda tidak memiliki akses untuk tindakan ini.");
  return user;
}
export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) return Response.json({ message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ message: "Akun Anda tidak memiliki akses untuk tindakan ini." }, { status: 403 });
  return null;
}
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export async function verifyGoogleCredential(credential: string, nonce: string, clientId = process.env.GOOGLE_CLIENT_ID) {
  if (!clientId) throw new AccessError(503, "Login Google belum diaktifkan. Hubungi admin TIDIGO.");
  if (!credential || credential.length > 16000 || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) throw new AccessError(401, "Login tidak valid. Silakan coba lagi.");
  try {
    const { payload } = await jwtVerify(credential, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId, algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp", "email", "email_verified", "nonce"], maxTokenAge: "10 minutes",
    });
    if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("INVALID_IDENTITY");
    return { sub: payload.sub, email: payload.email, name: typeof payload.name === "string" ? payload.name : payload.email,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      authoritativeEmail: payload.email.toLowerCase().endsWith("@gmail.com") || typeof payload.hd === "string" && payload.hd.length > 0 };
  } catch {
    throw new AccessError(401, "Verifikasi Google gagal atau kedaluwarsa. Silakan masuk kembali.");
  }
}
