import { createUsageSession, findActiveUsageByBarcode, listActiveUsageSessions, parseUsageInput } from "@/lib/usage-db";
import { requireUser, accessErrorResponse, AccessError } from "@/lib/auth";
import { getUser } from "@/lib/account-db";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const denied = accessErrorResponse(error); if (denied) return denied;
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ message: "Database belum terhubung." }, { status: 503 });
  if (message === "UNIT_NOT_AVAILABLE") return Response.json({ message: "Salah satu unit sudah digunakan atau tidak lagi tersedia. Scan ulang unit yang tersedia." }, { status: 409 });
  if (message.includes("duplicate key")) return Response.json({ message: "Nomor penggunaan sudah tercatat. Silakan ulangi konfirmasi." }, { status: 409 });
  return Response.json({ message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser(request);
    const barcode = new URL(request.url).searchParams.get("barcode");
    if (barcode !== null) {
      const session = await findActiveUsageByBarcode(barcode, actor);
      return session ? Response.json({ session }) : Response.json({ message: "Barcode ini tidak terdaftar pada sesi penggunaan aktif." }, { status: 404 });
    }
    return Response.json({ sessions: await listActiveUsageSessions(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser(request);
    const body = await request.json();
    if (actor.role === "COACH" && body.borrowerUserId && body.borrowerUserId !== actor.id) throw new AccessError(403, "Coach hanya dapat mengambil filamen untuk akun sendiri.");
    const borrower = actor.role === "COACH" || !body.borrowerUserId || body.borrowerUserId === actor.id ? actor : await getUser(String(body.borrowerUserId));
    if (!borrower || borrower.status !== "ACTIVE") throw new AccessError(400, "Pilih pengambil dengan akun aktif.");
    const input = parseUsageInput({ ...body, userName: borrower.name });
    if (!input.activityName) throw new AccessError(400, "Isi nama kelas atau kegiatan.");
    return Response.json({ session: await createUsageSession({ ...input, borrowerUserId: borrower.id }, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
