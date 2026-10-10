/* ————————————————————————————————————————
   POST /api/public/school-leads — the "For schools" form on the marketing
   site (lumni-site, on Lovable), which lives on another domain.

     { schoolName, contactName, role?, email, students?, message?, website? }

   Public, so: CORS for any origin (no cookies are involved), a honeypot —
   `website` is hidden on the form, so only a bot fills it — and a modest
   per-address limit. Answers { ok: true } or { error } with a status.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { UserFacingError } from "@/lib/actions/_error";
import { createSchoolLead } from "@/lib/school-licenses";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Per-process and approximate — enough to blunt a script, not a guarantee.
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > PER_WINDOW;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply({ error: "Expected JSON." }, 400);
  }
  // A filled honeypot gets a quiet success and nothing else.
  if (typeof b.website === "string" && b.website.trim()) return reply({ ok: true });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return reply({ error: "That's a few in a row — try again in an hour, or email us." }, 429);

  try {
    await createSchoolLead(
      {
        schoolName: String(b.schoolName ?? ""),
        contactName: String(b.contactName ?? ""),
        role: typeof b.role === "string" ? b.role : undefined,
        email: String(b.email ?? ""),
        students: b.students == null || b.students === "" ? null : Number(b.students),
        message: typeof b.message === "string" ? b.message : undefined,
      },
      "site",
    );
    return reply({ ok: true });
  } catch (err) {
    if (err instanceof UserFacingError) return reply({ error: err.message }, 400);
    console.error("[public:school-leads]", err);
    return reply({ error: "We couldn't send that just now. Please email us instead." }, 500);
  }
}
