import { requireUser, accessErrorResponse } from "@/lib/auth";
import { updateUser } from "@/lib/account-db";
export async function PATCH(request: Request, context: RouteContext<"/api/v1/users/[id]">) {
  try {
    const actor = await requireUser(request, ["OWNER"]);
    const { id } = await context.params;
    return Response.json({ user: await updateUser(id, await request.json(), actor) });
  } catch(error) { return accessErrorResponse(error) ?? Response.json({ message: error instanceof Error ? error.message : "Akun belum dapat diperbarui." }, { status: 400 }); }
}
