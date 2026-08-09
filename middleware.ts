/* ————————————————————————————————————————
   Route guards.

   A cheap first layer: unauthenticated users go to sign-in, and parents are
   turned away from student-only routes before a page renders.

   This is defence in depth, NOT the boundary itself. The real enforcement is
   in lib/auth/policy.ts and lib/db/queries/, which scope every query to the
   viewer. Middleware runs on the edge with only the session cookie, so it
   deliberately does no database work and makes no trust decision beyond the
   role already on the session.
   ———————————————————————————————————————— */

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const STUDENT_ONLY = ["/counselor", "/interviews"];
const PROTECTED = [
  "/admin",
  "/dashboard",
  // Onboarding writes a profile row against the signed-in user, so it needs a
  // session like any other authenticated route. Without this a signed-out
  // visitor could walk the whole questionnaire and only discover at the last
  // step that there was no account to save it to.
  "/onboarding",
  "/counselor",
  "/explore",
  "/list",
  "/apply",
  "/planner",
  "/interviews",
  "/decide",
  "/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Next doesn't expose the pathname to server components; pass it through so
  // the app layout can apply the role guard it needs a verified session for.
  const forward = new Headers(request.headers);
  forward.set("x-pathname", pathname);
  const proceed = () => NextResponse.next({ request: { headers: forward } });

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return proceed();

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The role check itself lives in app/(app)/layout.tsx, which can read the
  // verified session. Middleware runs on the edge with only the cookie, and
  // trusting a role from there would be trusting client-supplied data.
  return proceed();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/counselor/:path*",
    "/explore/:path*",
    "/list/:path*",
    "/apply/:path*",
    "/planner/:path*",
    "/interviews/:path*",
    "/decide/:path*",
    "/settings/:path*",
  ],
};
