import { getUsageSession } from "@/lib/usage-db";
import { requireUser, accessErrorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/v1/usages/[id]">) {
  try {
    const actor = await requireUser(_request);
    const { id } = await context.params;
    const session = await getUsageSession(id, actor);
    return session ? Response.json({ session }) : Response.json({ message: "Sesi penggunaan tidak ditemukan." }, { status: 404 });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const message = error instanceof Error ? error.message : "Sesi belum dapat dimuat.";
    return Response.json({ message: message === "DATABASE_NOT_CONFIGURED" ? "Database belum terhubung." : message }, { status: message === "DATABASE_NOT_CONFIGURED" ? 503 : 400 });
  }
}
