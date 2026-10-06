/* ————————————————————————————————————————
   The JSON API the iOS app speaks.

   The website talks to the server through server actions, which only a
   Next.js client can call. /api/v1 is the same actions behind plain HTTP,
   so the app and the site share one implementation of every rule — the
   policy layer, the ownership checks in each WHERE, the rate limits —
   rather than the app getting a second, drifting copy.

   Auth is the bearer token from Better Auth's bearer plugin. requireViewer()
   reads it through auth.api.getSession, so nothing in here re-derives who
   the caller is.

   Errors follow the same rule as safeError(): the caller decides what the
   user reads, and nothing a database said crosses the boundary.
   ———————————————————————————————————————— */

import "server-only";

import { NextResponse } from "next/server";
import { AuthzError } from "@/lib/auth/policy";
import { UserFacingError, safeError } from "@/lib/actions/_error";

/** Thrown by a handler to answer 400 with a message written for the user. */
export class BadRequest extends UserFacingError {}

/** Thrown for an id that names nothing the caller owns. */
export class NotFound extends UserFacingError {
  constructor() {
    super("Not found.");
  }
}

type Handler<P> = (request: Request, params: P) => Promise<unknown>;

/**
 * Wrap a route handler: JSON out, errors mapped to status codes.
 *
 * `undefined` from the handler is a 204. Anything else is the JSON body —
 * the iOS client decodes the domain shapes in lib/types.ts directly, so
 * handlers return them unwrapped.
 */
export function route<P = Record<string, never>>(
  tag: string,
  userMessage: string,
  handler: Handler<P>,
) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const result = await handler(request, await ctx.params);
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      const status =
        err instanceof AuthzError
          ? err.message === "Not signed in"
            ? 401
            : 403
          : err instanceof NotFound
            ? 404
            : err instanceof UserFacingError
              ? 400
              : 500;
      return NextResponse.json(
        { error: safeError(`api:${tag}`, err, userMessage) },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}

/** The request body as an object, or a 400 the user can read. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new BadRequest("The request was malformed.");
}

/** `value` if it's one of `allowed`, otherwise a 400. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new BadRequest(`Invalid ${field}.`);
}

/** Same, but `undefined` passes through — for PATCH bodies. */
export function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  return value === undefined ? undefined : oneOf(value, allowed, field);
}

export function str(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== "string" || value.length > max) throw new BadRequest(`Invalid ${field}.`);
  return value;
}

/** A string that must say something — ids, mostly. */
export function nonEmpty(value: unknown, field: string, max = 200): string {
  const s = str(value, field, max).trim();
  if (!s) throw new BadRequest(`Invalid ${field}.`);
  return s;
}

/*
  Postgres throws on a malformed uuid comparison rather than returning no
  rows, which would turn a hand-typed id into a 500. Same guard as the
  transcript route.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: string): string {
  if (!UUID.test(value)) throw new NotFound();
  return value;
}
