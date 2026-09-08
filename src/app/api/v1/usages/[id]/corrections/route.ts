import { createUsageCorrection, getUsageSession, listUsageCorrections, parseUsageCorrectionInput } from "@/lib/usage-db";
import { accessErrorResponse, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function correctionError(error: unknown) {
  const denied = accessErrorResponse(error); if (denied) return denied;
  const message = error instanceof Error ? error.message : "Koreksi belum dapat diproses.";
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  if (message === "USAGE_NOT_FOUND") return Response.json({ message: "Sesi penggunaan tidak ditemukan." }, { status: 404 });
  if (message === "CORRECTION_SESSION_NOT_COMPLETED") return Response.json({ message: "Gram masih dapat diubah langsung sebelum sesi difinalisasi." }, { status: 409 });
  if (message === "CORRECTION_MEASUREMENT_PENDING") return Response.json({ message: "Selesaikan Verifikasi gram terlebih dahulu sebelum membuat koreksi." }, { status: 409 });
  if (message === "CORRECTION_NO_CHANGE") return Response.json({ message: "Tidak ada gram yang berubah." }, { status: 400 });
  if (message === "CORRECTION_ITEMS_MISMATCH") return Response.json({ message: "Data unit berubah atau gram melebihi saldo awal. Muat ulang detail sesi." }, { status: 409 });
  if (message === "CORRECTION_REQUEST_CONFLICT" || message.includes("usage_corrections_one_pending_idx")) return Response.json({ message: "Sesi ini sudah memiliki koreksi yang menunggu peninjauan." }, { status: 409 });
  if (message === "CORRECTION_APPLY_CONFLICT") return Response.json({ message: "Koreksi tersimpan tetapi belum dapat diterapkan. Pastikan unit tidak sedang digunakan dan stok mencukupi, lalu tinjau dari menu Koreksi penggunaan." }, { status: 409 });
  return Response.json({ message }, { status: 400 });
}

export async function GET(request: Request, context: RouteContext<"/api/v1/usages/[id]/corrections">) {
  try {
    const actor = await requireUser(request);
    const { id } = await context.params;
    if (!await getUsageSession(id, actor)) return Response.json({ message: "Sesi penggunaan tidak ditemukan." }, { status: 404 });
    return Response.json({ corrections: await listUsageCorrections(actor, id) });
  } catch (error) { return correctionError(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/v1/usages/[id]/corrections">) {
  try {
    const actor = await requireUser(request);
    const { id } = await context.params;
    const correction = await createUsageCorrection(id, parseUsageCorrectionInput(await request.json()), actor);
    return Response.json({ correction }, { status: correction.status === "PENDING" ? 201 : 200 });
  } catch (error) { return correctionError(error); }
}
