import { createInventoryItem, listInventory, parseInventoryInput } from "@/lib/inventory-db";

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

export async function GET() {
  try {
    return Response.json({ items: await listInventory() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInventoryInput(await request.json());
    return Response.json({ item: await createInventoryItem(input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

