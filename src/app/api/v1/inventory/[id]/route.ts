import { deleteInventoryItem, getInventoryItem, parseInventoryInput, updateInventoryItem } from "@/lib/inventory-db";
import { requireUser, accessErrorResponse, AccessError } from "@/lib/auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const denied = accessErrorResponse(error); if (denied) return denied;
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  if (message === "DATABASE_NOT_CONFIGURED") {
    return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  }
  if (message.includes("duplicate key")) {
    return Response.json({ message: "Kode filamen sudah digunakan." }, { status: 409 });
  }
  return Response.json({ message }, { status: 400 });
}

export async function GET(_request: Request, context: RouteContext<"/api/v1/inventory/[id]">) {
  try {
    const actor = await requireUser(_request);
    const { id } = await context.params;
    const item = await getInventoryItem(id);
    return item ? Response.json({ item: actor.role === "COACH" ? { ...item, unitCost: null } : item }) : Response.json({ message: "Data filamen tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/inventory/[id]">) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 500) throw new AccessError(400, "Isi alasan perubahan, 3–500 karakter.");
    const input = parseInventoryInput(body);
    const item = await updateInventoryItem(id, input, actor, reason);
    return item ? Response.json({ item }) : Response.json({ message: "Unit tidak ditemukan atau sedang digunakan. Selesaikan penggunaan sebelum mengubah stok." }, { status: 409 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/v1/inventory/[id]">) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const body = await request.json();
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 500) throw new AccessError(400, "Isi alasan penghapusan, 3–500 karakter.");
    const { id } = await context.params;
    return (await deleteInventoryItem(id, actor, reason))
      ? Response.json({ success: true })
      : Response.json({ message: "Data filamen tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
