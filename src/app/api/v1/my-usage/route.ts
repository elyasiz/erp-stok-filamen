import { requireUser, accessErrorResponse } from "@/lib/auth";
import { listMyUsageSessions } from "@/lib/usage-db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const actor = await requireUser(request); return Response.json({ sessions: await listMyUsageSessions(actor) }); }
  catch(error) { return accessErrorResponse(error) ?? Response.json({ message: "Penggunaan Anda belum dapat dimuat." }, { status: 503 }); }
}
