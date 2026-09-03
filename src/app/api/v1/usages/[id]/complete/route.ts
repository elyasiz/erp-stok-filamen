import { completeUsageSession, parseUsageCompletionInput } from "@/lib/usage-db";
import { requireUser, accessErrorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/v1/usages/[id]/complete">) {
  try {
    const actor = await requireUser(request);
    const { id } = await context.params;
    const input = parseUsageCompletionInput(await request.json());
    return Response.json({ session: await completeUsageSession(id, input, actor) });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const message = error instanceof Error ? error.message : "Penggunaan belum dapat diselesaikan.";
    if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
    if (message === "USAGE_NOT_FOUND") return Response.json({ message: "Sesi penggunaan tidak ditemukan." }, { status: 404 });
    if (message === "USAGE_ALREADY_COMPLETED") return Response.json({ message: "Sesi ini sudah ditutup. Stok tidak dikurangi lagi." }, { status: 409 });
    if (message === "USAGE_COMPLETION_CONFLICT") return Response.json({ message: "Finalisasi ditolak: pastikan semua barcode sesuai, gram tidak melebihi saldo, dan stok belum berubah. Muat ulang sesi untuk memeriksa data terbaru." }, { status: 409 });
    return Response.json({ message }, { status: 400 });
  }
}
