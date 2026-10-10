/* ————————————————————————————————————————
   Free access to Pro, for students who can't afford it
   (docs/plans/lumni-pro.md, step 4).

   A student — or a parent, for their family — writes a sentence or two;
   admins are emailed; the request waits in Admin › Free access. Approving
   grants 12 months of Pro (source "free_access"), shared across the
   account's parent link like any other Pro. Judgment rather than
   verification, until there's volume enough to need more.
   ———————————————————————————————————————— */

import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, entitlements, freeAccessRequests, users } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/actions/_error";
import { isPro, proRemoved, proStatus } from "@/lib/entitlements";
import { freeAccessDecisionEmail, freeAccessRequestedEmail, sendEmail } from "@/lib/email";
import { adminUrl, notifyAdmins } from "@/lib/admin-notify";
import type { Viewer } from "@/lib/auth/policy";

export const FREE_ACCESS_MONTHS = 12;
const MESSAGE_MAX = 1_000;

export interface MyRequest {
  status: "pending" | "approved" | "declined";
  createdAt: string;
  decisionNote: string | null;
}

/** The viewer's most recent request, if any. */
export async function myFreeAccessRequest(viewer: Viewer): Promise<MyRequest | null> {
  const [row] = await db
    .select()
    .from(freeAccessRequests)
    .where(eq(freeAccessRequests.userId, viewer.userId))
    .orderBy(desc(freeAccessRequests.createdAt))
    .limit(1);
  return row
    ? { status: row.status, createdAt: row.createdAt.toISOString(), decisionNote: row.status === "declined" ? row.decisionNote : null }
    : null;
}

export async function requestFreeAccess(viewer: Viewer, input: { message: string; schoolName?: string }): Promise<MyRequest> {
  if (viewer.role !== "student" && viewer.role !== "parent") throw new UserFacingError("Only student and parent accounts can ask.");
  const message = input.message.trim();
  if (message.length < 10) throw new UserFacingError("Tell us a little about your situation — a sentence or two is plenty.");
  if (message.length > MESSAGE_MAX) throw new UserFacingError(`Keep it under ${MESSAGE_MAX} characters.`);
  if (isPro(await proStatus(viewer.userId, viewer.role))) throw new UserFacingError("You already have Pro.");
  if (await proRemoved(viewer.userId)) throw new UserFacingError("Pro isn't available on this account. Write to support@promptllc.com if you think that's a mistake.");

  const existing = await myFreeAccessRequest(viewer);
  if (existing?.status === "pending") throw new UserFacingError("Your request is already with us — we'll email you when it's decided.");

  const schoolName = input.schoolName?.trim().slice(0, 200) || null;
  await db.insert(freeAccessRequests).values({ userId: viewer.userId, message, schoolName });
  await notifyAdmins(freeAccessRequestedEmail({ email: viewer.email, message, schoolName, adminUrl: adminUrl("/admin/access") }));
  return (await myFreeAccessRequest(viewer))!;
}

function plusMonths(at: Date, months: number): Date {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Approve or decline. Approving grants Pro; either way the requester is told. */
export async function decideFreeAccess(
  adminId: string,
  requestId: string,
  input: { approve: boolean; note?: string },
): Promise<void> {
  const [req] = await db.select().from(freeAccessRequests).where(eq(freeAccessRequests.id, requestId)).limit(1);
  if (!req) throw new UserFacingError("That request no longer exists.");
  if (req.status !== "pending") throw new UserFacingError("That request has already been decided.");
  const note = input.note?.trim().slice(0, 500) || null;
  const now = new Date();
  const until = plusMonths(now, FREE_ACCESS_MONTHS);

  await db.transaction(async (tx) => {
    // Pinned to pending, so two admins deciding at once can't both act.
    const [claimed] = await tx
      .update(freeAccessRequests)
      .set({ status: input.approve ? "approved" : "declined", decidedBy: adminId, decidedAt: now, decisionNote: note, updatedAt: now })
      .where(and(eq(freeAccessRequests.id, requestId), eq(freeAccessRequests.status, "pending")))
      .returning({ id: freeAccessRequests.id });
    if (!claimed) throw new UserFacingError("That request has already been decided.");
    if (input.approve) {
      const [ent] = await tx
        .insert(entitlements)
        .values({ userId: req.userId, source: "free_access", endsAt: until, grantedBy: adminId, note: note ?? "Free access approved" })
        .returning({ id: entitlements.id });
      await tx.insert(accountEvents).values({
        userId: req.userId,
        actorId: adminId,
        actorKind: "admin",
        action: "pro.granted",
        reason: note ?? "Free access approved",
        detail: { entitlementId: ent.id, source: "free_access", endsAt: until.toISOString(), requestId },
      });
    } else {
      await tx.insert(accountEvents).values({
        userId: req.userId,
        actorId: adminId,
        actorKind: "admin",
        action: "free_access.declined",
        reason: note,
        detail: { requestId },
      });
    }
  });

  const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.userId)).limit(1);
  if (person) {
    await sendEmail({
      ...freeAccessDecisionEmail({
        approved: input.approve,
        until: until.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        note,
      }),
      to: person.email,
    });
  }
}
