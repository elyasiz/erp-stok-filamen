import { createUsageSession, findActiveUsageByBarcode, listActiveUsageSessions, parseUsageInput } from "@/lib/usage-db";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  if (message === "UNIT_NOT_AVAILABLE") return Response.json({ message: "Salah satu unit sudah digunakan atau tidak lagi tersedia. Scan ulang unit yang tersedia." }, { status: 409 });
  if (message.includes("duplicate key")) return Response.json({ message: "Nomor penggunaan sudah tercatat. Silakan ulangi konfirmasi." }, { status: 409 });
  return Response.json({ message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const barcode = new URL(request.url).searchParams.get("barcode");
    if (barcode !== null) {
      const session = await findActiveUsageByBarcode(barcode);
      return session ? Response.json({ session }) : Response.json({ message: "Barcode ini tidak terdaftar pada sesi penggunaan aktif." }, { status: 404 });
    }
    return Response.json({ sessions: await listActiveUsageSessions() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseUsageInput(await request.json());
    return Response.json({ session: await createUsageSession(input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
