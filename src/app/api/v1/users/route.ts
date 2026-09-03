import { requireUser, accessErrorResponse } from "@/lib/auth";
import { listUsers, createUser, parseUser } from "@/lib/account-db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requireUser(request, ["OWNER", "ADMIN"]);
    const users = await listUsers();
    return Response.json({ users: actor.role === "OWNER" ? users : users.filter(user => user.status === "ACTIVE").map(user => ({ id: user.id, name: user.name })) });
  } catch(error) { return accessErrorResponse(error) ?? Response.json({ message: "Daftar pengguna belum dapat dimuat." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireUser(request, ["OWNER"]);
    return Response.json({ user: await createUser(parseUser(await request.json()), actor) }, { status: 201 });
  } catch(error) {
    const denied = accessErrorResponse(error); if (denied) return denied;
    const message = error instanceof Error ? error.message : "Akun belum dapat dibuat.";
    if (message.includes("duplicate key")) return Response.json({ message: "Email sudah terdaftar." }, { status: 409 });
    return Response.json({ message: message.includes("DATABASE") ? "Database belum tersedia." : message }, { status: 400 });
  }
}
