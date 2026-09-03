import { signInPassword } from "@/lib/account-db";
import { authInput, limitAuthRequest, signedInResponse, authenticationError } from "@/lib/auth-route";
export async function POST(request: Request) {
  try {
    const body = await authInput(request);
    await limitAuthRequest(request, "login");
    return await signedInResponse(await signInPassword(body.email, body.password));
  } catch (error) { return authenticationError(error); }
}
