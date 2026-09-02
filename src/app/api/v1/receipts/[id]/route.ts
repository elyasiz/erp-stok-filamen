import { deleteReceipt, getReceipt, parseReceiptInput, updateReceipt } from "@/lib/receipts-db";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  if (message.includes("duplicate key")) return Response.json({ message: "Nomor penerimaan atau kode unit sudah digunakan." }, { status: 409 });
  return Response.json({ message }, { status: 400 });
}

export async function GET(_request: Request, context: RouteContext<"/api/v1/receipts/[id]">) {
  try {
    const { id } = await context.params;
    const receipt = await getReceipt(id);
    return receipt ? Response.json({ receipt }) : Response.json({ message: "Penerimaan tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/v1/receipts/[id]">) {
  try {
    const { id } = await context.params;
    const receipt = await updateReceipt(id, parseReceiptInput(await request.json()));
    return receipt ? Response.json({ receipt }) : Response.json({ message: "Penerimaan tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/v1/receipts/[id]">) {
  try {
    const { id } = await context.params;
    return (await deleteReceipt(id))
      ? Response.json({ success: true })
      : Response.json({ message: "Penerimaan tidak ditemukan." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

