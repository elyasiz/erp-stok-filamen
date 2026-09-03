import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { assertSameOrigin, accessErrorResponse, nonceCookie, cookieOptions } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const nonce = randomBytes(32).toString("base64url");
    (await cookies()).set(nonceCookie, nonce, { ...cookieOptions, maxAge: 600 });
    return Response.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) { return accessErrorResponse(error) ?? Response.json({ message: "Login belum dapat dimulai." }, { status: 503 }); }
}
