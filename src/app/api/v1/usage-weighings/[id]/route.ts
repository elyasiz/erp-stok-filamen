import { accessErrorResponse, requireUser } from "@/lib/auth";
import { parseUsageWeighingInput, verifyUsageWeighing } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/v1/usage-weighings/[id]">) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const { id } = await context.params;
    return Response.json({ session: await verifyUsageWeighing(id, parseUsageWeighingInput(await request.json()), actor) });
  } catch (error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const message = error instanceof Error ? error.message : "Penimbangan belum dapat disimpan.";
    if (message === "WEIGHING_NOT_FOUND") return Response.json({ message: "Tugas penimbangan tidak ditemukan atau sudah diselesaikan." }, { status: 404 });
    if (message === "WEIGHING_ITEMS_MISMATCH") return Response.json({ message: "Data unit tidak sesuai. Muat ulang lalu masukkan hasil timbang kembali." }, { status: 409 });
    if (message === "WEIGHING_APPLY_CONFLICT") return Response.json({ message: "Stok berubah sejak kegagalan dicatat. Periksa unit lalu muat ulang tugas penimbangan." }, { status: 409 });
    return Response.json({ message }, { status: message === "DATABASE_NOT_CONFIGURED" ? 503 : 400 });
  }
}
