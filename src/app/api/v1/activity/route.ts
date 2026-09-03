import { requireUser, accessErrorResponse } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit-db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireUser(request, ["OWNER", "ADMIN"]); return Response.json({ events: await listAuditEvents() }); }
  catch(error) { return accessErrorResponse(error) ?? Response.json({ message: "Aktivitas belum dapat dimuat." }, { status: 503 }); }
}
