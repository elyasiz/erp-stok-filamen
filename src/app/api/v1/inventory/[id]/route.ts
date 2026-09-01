import { deleteInventoryItem, getInventoryItem, parseInventoryInput, updateInventoryItem } from "@/lib/inventory-db";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
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
    const { id } = await context.params;
    const item = await getInventoryItem(id);
    return item ? Response.json({ item }) : Response.json({ message: "Data filamen tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/inventory/[id]">) {
  try {
    const { id } = await context.params;
    const input = parseInventoryInput(await request.json());
    const item = await updateInventoryItem(id, input);
    return item ? Response.json({ item }) : Response.json({ message: "Data filamen tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/v1/inventory/[id]">) {
  try {
    const { id } = await context.params;
    return (await deleteInventoryItem(id))
      ? Response.json({ success: true })
      : Response.json({ message: "Data filamen tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

