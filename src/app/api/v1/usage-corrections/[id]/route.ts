import { accessErrorResponse, requireUser } from "@/lib/auth";
import { parseUsageCorrectionReviewInput, reviewUsageCorrection } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/v1/usage-corrections/[id]">) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const { id } = await context.params;
    return Response.json({ correction: await reviewUsageCorrection(id, parseUsageCorrectionReviewInput(await request.json()), actor) });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const message = error instanceof Error ? error.message : "Koreksi belum dapat ditinjau.";
    if (message === "CORRECTION_NOT_FOUND") return Response.json({ message: "Permintaan koreksi tidak ditemukan." }, { status: 404 });
    if (message === "CORRECTION_ALREADY_REVIEWED") return Response.json({ message: "Permintaan ini sudah ditinjau sebelumnya." }, { status: 409 });
    if (message === "CORRECTION_APPLY_CONFLICT") return Response.json({ message: "Koreksi belum dapat diterapkan. Selesaikan penggunaan aktif pada unit terkait atau periksa saldo stok terlebih dahulu." }, { status: 409 });
    return Response.json({ message }, { status: message === "DATABASE_NOT_CONFIGURED" ? 503 : 400 });
  }
}
