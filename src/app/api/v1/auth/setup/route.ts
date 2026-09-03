import { bootstrapOwner, signInPassword } from "@/lib/account-db";
import { authInput, limitAuthRequest, signedInResponse, authenticationError } from "@/lib/auth-route";
export async function POST(request: Request) {
  try {
    const body = await authInput(request);
    await limitAuthRequest(request, "setup", 10);
    const user = await bootstrapOwner(body);
    return await signedInResponse(await signInPassword(user.email, body.password));
  } catch (error) { return authenticationError(error); }
}
