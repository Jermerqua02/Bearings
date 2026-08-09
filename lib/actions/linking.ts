/* ————————————————————————————————————————
   Parent linking and essay sharing.

   Both are student-controlled. The settings copy promises the student owns
   this relationship, so a parent has no action here that grants themselves
   access — invites are issued by the student and revoked by the student.
   ———————————————————————————————————————— */

"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { essayShares, essays, parentStudentLinks, users } from "@/lib/db/schema";
import { AuthzError, requireStudent, requireViewer } from "@/lib/auth/policy";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  if (err instanceof AuthzError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

/* ————————————— Linking ————————————— */

/** Student invites a parent by email. Returns the token for the invite link. */
export async function inviteParent(
  parentEmail: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const student = await requireStudent();
    const email = parentEmail.trim().toLowerCase();
    if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };

    const token = randomBytes(32).toString("base64url");

    // If the student previously invited this address, reissue rather than
    // colliding with the unique(studentId, parentEmail) constraint.
    const [existing] = await db
      .select({ id: parentStudentLinks.id })
      .from(parentStudentLinks)
      .where(
        and(
          eq(parentStudentLinks.studentId, student.userId),
          eq(parentStudentLinks.parentEmail, email),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(parentStudentLinks)
        .set({
          status: "invited",
          inviteToken: token,
          invitedAt: new Date(),
          acceptedAt: null,
          revokedAt: null,
          parentId: null,
          updatedAt: new Date(),
        })
        .where(eq(parentStudentLinks.id, existing.id));
    } else {
      await db.insert(parentStudentLinks).values({
        studentId: student.userId,
        parentEmail: email,
        inviteToken: token,
        status: "invited",
      });
    }

    revalidatePath("/settings");
    return { ok: true, token };
  } catch (err) {
    return fail(err) as { ok: false; error: string };
  }
}

/** Parent accepts an invite. Binds the link to their account. */
export async function acceptParentInvite(token: string): Promise<ActionResult> {
  try {
    const viewer = await requireViewer();
    if (viewer.role !== "parent") {
      return { ok: false, error: "Only a parent account can accept this invitation." };
    }

    const [link] = await db
      .select()
      .from(parentStudentLinks)
      .where(
        and(eq(parentStudentLinks.inviteToken, token), eq(parentStudentLinks.status, "invited")),
      )
      .limit(1);

    if (!link) return { ok: false, error: "That invitation is no longer valid." };

    // The invite is addressed to a specific email; don't let a different
    // account claim a token that leaked.
    if (link.parentEmail.toLowerCase() !== viewer.email.toLowerCase()) {
      return { ok: false, error: "This invitation was sent to a different email address." };
    }

    await db
      .update(parentStudentLinks)
      .set({
        parentId: viewer.userId,
        status: "active",
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(parentStudentLinks.id, link.id));

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Student revokes a parent's access. Also revokes every essay share granted
 * to that parent — otherwise a share would outlive the link that justified it.
 */
export async function revokeParentLink(linkId: string): Promise<ActionResult> {
  try {
    const student = await requireStudent();

    const [link] = await db
      .select()
      .from(parentStudentLinks)
      .where(
        and(eq(parentStudentLinks.id, linkId), eq(parentStudentLinks.studentId, student.userId)),
      )
      .limit(1);
    if (!link) return { ok: false, error: "That link doesn't exist." };

    await db.transaction(async (tx) => {
      await tx
        .update(parentStudentLinks)
        .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(parentStudentLinks.id, linkId));

      if (link.parentId) {
        const owned = await tx
          .select({ id: essays.id })
          .from(essays)
          .where(eq(essays.studentId, student.userId));
        for (const e of owned) {
          await tx
            .update(essayShares)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(essayShares.essayId, e.id),
                eq(essayShares.grantedToUserId, link.parentId),
                isNull(essayShares.revokedAt),
              ),
            );
        }
      }
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ————————————— Essay sharing ————————————— */

/** Student shares one essay with their linked parent. */
export async function shareEssay(essayId: string): Promise<ActionResult> {
  try {
    const student = await requireStudent();

    const [essay] = await db
      .select({ id: essays.id })
      .from(essays)
      .where(and(eq(essays.id, essayId), eq(essays.studentId, student.userId)))
      .limit(1);
    if (!essay) return { ok: false, error: "That essay doesn't exist." };

    const [link] = await db
      .select({ parentId: parentStudentLinks.parentId })
      .from(parentStudentLinks)
      .where(
        and(
          eq(parentStudentLinks.studentId, student.userId),
          eq(parentStudentLinks.status, "active"),
        ),
      )
      .limit(1);
    if (!link?.parentId) return { ok: false, error: "No linked parent to share with." };

    // sharedAt becomes the version cutoff — earlier revisions stay private.
    await db
      .insert(essayShares)
      .values({ essayId, grantedToUserId: link.parentId, sharedAt: new Date() })
      .onConflictDoUpdate({
        target: [essayShares.essayId, essayShares.grantedToUserId],
        set: { revokedAt: null, sharedAt: new Date(), updatedAt: new Date() },
      });

    revalidatePath("/apply");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function unshareEssay(essayId: string): Promise<ActionResult> {
  try {
    const student = await requireStudent();

    const [essay] = await db
      .select({ id: essays.id })
      .from(essays)
      .where(and(eq(essays.id, essayId), eq(essays.studentId, student.userId)))
      .limit(1);
    if (!essay) return { ok: false, error: "That essay doesn't exist." };

    await db
      .update(essayShares)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(essayShares.essayId, essayId), isNull(essayShares.revokedAt)));

    revalidatePath("/apply");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** The student's view of who they've linked. */
export async function getMyLinks() {
  const student = await requireStudent();
  return db
    .select({
      id: parentStudentLinks.id,
      parentEmail: parentStudentLinks.parentEmail,
      status: parentStudentLinks.status,
      invitedAt: parentStudentLinks.invitedAt,
      acceptedAt: parentStudentLinks.acceptedAt,
      parentName: users.name,
    })
    .from(parentStudentLinks)
    .leftJoin(users, eq(users.id, parentStudentLinks.parentId))
    .where(eq(parentStudentLinks.studentId, student.userId));
}
