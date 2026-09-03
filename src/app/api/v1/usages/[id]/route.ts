import { getUsageSession } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/v1/usages/[id]">) {
  try {
    const { id } = await context.params;
    const session = await getUsageSession(id);
    return session ? Response.json({ session }) : Response.json({ message: "Sesi penggunaan tidak ditemukan." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sesi belum dapat dimuat.";
    return Response.json({ message: message === "DATABASE_NOT_CONFIGURED" ? "Database belum terhubung." : message }, { status: message === "DATABASE_NOT_CONFIGURED" ? 503 : 400 });
  }
}
