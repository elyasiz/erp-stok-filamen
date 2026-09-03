import { getReports } from "@/lib/reports-db";
import { requireUser, accessErrorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser(request, ["OWNER", "ADMIN"]);
    return Response.json(await getReports(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    return Response.json({ message: unconfigured ? "Database belum terhubung." : "Data laporan gagal dimuat. Silakan muat ulang." }, { status: unconfigured ? 503 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
