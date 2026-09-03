import { cookies } from "next/headers";
import { revokeSession } from "@/lib/account-db";
import { assertSameOrigin, accessErrorResponse, sessionCookie, cookieOptions } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const jar = await cookies();
    await revokeSession(jar.get(sessionCookie)?.value);
    jar.set(sessionCookie, "", { ...cookieOptions, maxAge: 0 });
    return Response.json({ success: true });
  } catch(error) { return accessErrorResponse(error) ?? Response.json({ message: "Belum dapat keluar. Coba lagi." }, { status: 503 }); }
}
