import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ user: await currentUser(), googleClientId: process.env.GOOGLE_CLIENT_ID || null, configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.DATABASE_URL && process.env.AUTH_OWNER_EMAIL) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ message: "Akun belum dapat dimuat. Silakan coba lagi." }, { status: 503 }); }
}
