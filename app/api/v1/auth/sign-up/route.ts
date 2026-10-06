/* ————————————————————————————————————————
   POST /api/v1/auth/sign-up

   Signup can't go straight to Better Auth's endpoint: the role and the
   consent record are written by signUpWithRole, in code the client can't
   skip. The app signs in through /api/auth/sign-in/email afterwards to get
   its token, the same way a returning user does.
   ———————————————————————————————————————— */

import { signUpWithRole } from "@/lib/actions/auth";
import { BadRequest, body, route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const POST = route("sign-up", "Something went wrong creating the account.", async (request) => {
  const b = await body(request);
  const result = await signUpWithRole({
    email: String(b.email ?? ""),
    password: String(b.password ?? ""),
    name: String(b.name ?? ""),
    role: String(b.role ?? ""),
    acceptedTerms: b.acceptedTerms === true,
    meetsAgeRequirement: b.meetsAgeRequirement === true,
  });
  // signUpWithRole's messages are already written for the person reading.
  if (!result.ok) throw new BadRequest(result.error);
  return { ok: true };
});
