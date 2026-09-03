import { createReceipt, listReceipts, parseReceiptInput } from "@/lib/receipts-db";
import { requireUser, accessErrorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const denied = accessErrorResponse(error); if (denied) return denied;
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  if (message.includes("duplicate key")) return Response.json({ message: "Nomor penerimaan atau kode unit sudah digunakan." }, { status: 409 });
  return Response.json({ message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    await requireUser(request, ["OWNER", "ADMIN"]);
    return Response.json({ receipts: await listReceipts() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const input = parseReceiptInput(await request.json());
    return Response.json({ receipt: await createReceipt(input, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
