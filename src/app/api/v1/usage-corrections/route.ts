import { accessErrorResponse, requireUser } from "@/lib/auth";
import { listUsageCorrections } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    return Response.json({ corrections: await listUsageCorrections(actor) });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    return Response.json({ message: "Daftar koreksi belum dapat dimuat." }, { status: 503 });
  }
}
