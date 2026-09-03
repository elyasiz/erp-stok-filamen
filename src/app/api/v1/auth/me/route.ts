import { currentUser } from "@/lib/auth";
import { accountSetupStatus } from "@/lib/account-db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ user: await currentUser(), ...await accountSetupStatus() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ message: "Akun belum dapat dimuat. Silakan coba lagi." }, { status: 503 }); }
}
