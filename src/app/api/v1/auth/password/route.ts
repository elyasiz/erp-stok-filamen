import { AccessError, currentUser } from "@/lib/auth";
import { changePassword } from "@/lib/account-db";
import { authInput, limitAuthRequest, signedInResponse, authenticationError } from "@/lib/auth-route";
export async function POST(request: Request) {
  try {
    const body = await authInput(request);
    const user = await currentUser();
    if (!user) throw new AccessError(401, "Sesi berakhir. Silakan masuk kembali.");
    await limitAuthRequest(request, "password");
    return await signedInResponse(await changePassword(user, body.currentPassword, body.password));
  } catch (error) { return authenticationError(error); }
}
