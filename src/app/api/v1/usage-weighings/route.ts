import { accessErrorResponse, requireUser } from "@/lib/auth";
import { listUsageWeighings } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    return Response.json({ weighings: await listUsageWeighings(actor) });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    return Response.json({ message: "Daftar unit yang perlu ditimbang belum dapat dimuat." }, { status: 503 });
  }
}
