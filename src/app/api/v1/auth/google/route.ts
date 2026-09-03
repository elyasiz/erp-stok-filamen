import { cookies } from "next/headers";
import { signInGoogle, sessionLifetime, revokeSession } from "@/lib/account-db";
import { AccessError, assertSameOrigin, accessErrorResponse, verifyGoogleCredential, nonceCookie, sessionCookie, cookieOptions } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError(400, "Data login tidak valid.");
    const jar = await cookies();
    const nonce = jar.get(nonceCookie)?.value;
    jar.set(nonceCookie, "", { ...cookieOptions, maxAge: 0 });
    if (!nonce) throw new AccessError(401, "Permintaan login kedaluwarsa. Silakan coba lagi.");
    const body = await request.json();
    const identity = await verifyGoogleCredential(typeof body.credential === "string" ? body.credential : "", nonce);
    const result = await signInGoogle(identity);
    await revokeSession(jar.get(sessionCookie)?.value);
    jar.set(sessionCookie, result.token, { ...cookieOptions, maxAge: sessionLifetime });
    return Response.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_ALLOWED") return Response.json({ message: "Akun belum memiliki akses atau sedang dinonaktifkan. Hubungi admin TIDIGO." }, { status: 403 });
    return accessErrorResponse(error) ?? Response.json({ message: "Login belum berhasil. Silakan coba lagi." }, { status: 503 });
  }
}
