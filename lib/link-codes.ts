/* ————————————————————————————————————————
   Linking a student and a parent, by code.

   Either side starts it — Settings › Link an account — and gets a short
   code to send however they like. The other side enters it, and the two
   accounts are linked. It's deliberate on both ends: nobody is linked to
   anyone they didn't choose.

   One to one: a student links one parent, a parent one student. Pro is
   shared across that link (lib/entitlements.ts), so a purchase by either
   covers the pair, and only the pair.

   The older email invitation (lib/actions/linking.ts) still works and
   follows the same one-to-one rule.
   ———————————————————————————————————————— */

import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, essays, essayShares, linkCodes, parentStudentLinks, users } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/actions/_error";
import type { Viewer } from "@/lib/auth/policy";

const CODE_DAYS = 7;
// No 0/O, 1/I/L, so a code read aloud or typed from a text comes out right.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function normalize(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export interface LinkedPerson {
  name: string;
  email: string;
  role: "student" | "parent";
  since: Date | null;
}

/** The account on the other end of this viewer's active link, if any. */
export async function linkedPerson(viewer: Viewer): Promise<LinkedPerson | null> {
  const asStudent = viewer.role === "student";
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      since: parentStudentLinks.acceptedAt,
    })
    .from(parentStudentLinks)
    .innerJoin(users, eq(users.id, asStudent ? parentStudentLinks.parentId : parentStudentLinks.studentId))
    .where(
      and(
        eq(parentStudentLinks.status, "active"),
        eq(asStudent ? parentStudentLinks.studentId : parentStudentLinks.parentId, viewer.userId),
      ),
    )
    .limit(1);
  return row ? { ...row, role: asStudent ? "parent" : "student" } : null;
}

/** This viewer's unused, unexpired code, if they have one out. */
export async function pendingCode(viewer: Viewer): Promise<{ code: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({ code: linkCodes.code, expiresAt: linkCodes.expiresAt })
    .from(linkCodes)
    .where(and(eq(linkCodes.createdBy, viewer.userId), isNull(linkCodes.usedAt), gt(linkCodes.expiresAt, new Date())))
    .limit(1);
  return row ? { code: formatCode(row.code), expiresAt: row.expiresAt } : null;
}

function requireLinkable(viewer: Viewer) {
  if (viewer.role !== "student" && viewer.role !== "parent") {
    throw new UserFacingError("Only student and parent accounts can be linked.");
  }
}

/** Make a code for the other side to enter. Replaces any code still out. */
export async function createLinkCode(viewer: Viewer): Promise<{ code: string; expiresAt: Date }> {
  requireLinkable(viewer);
  const existing = await linkedPerson(viewer);
  if (existing) {
    throw new UserFacingError(`You're already linked to ${existing.name || existing.email}. Unlink first to link someone else.`);
  }

  const expiresAt = new Date(Date.now() + CODE_DAYS * 86_400_000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    try {
      await db.transaction(async (tx) => {
        // One code out at a time: a new one retires the last.
        await tx
          .update(linkCodes)
          .set({ expiresAt: new Date() })
          .where(and(eq(linkCodes.createdBy, viewer.userId), isNull(linkCodes.usedAt), gt(linkCodes.expiresAt, new Date())));
        await tx.insert(linkCodes).values({ code, createdBy: viewer.userId, expiresAt });
      });
      return { code: formatCode(code), expiresAt };
    } catch (err) {
      // A collision on the unique code: try another. Anything else is real.
      if (!(err instanceof Error && /link_code_code_unique|duplicate key/.test(err.message))) throw err;
    }
  }
  throw new Error("Could not make a unique link code.");
}

/** Enter someone else's code and link to them. */
export async function redeemLinkCode(viewer: Viewer, input: string): Promise<LinkedPerson> {
  requireLinkable(viewer);
  const code = normalize(input);
  if (code.length !== 6) throw new UserFacingError("A link code is six letters and numbers, like 7Q2-K9M.");

  const [row] = await db
    .select({ id: linkCodes.id, createdBy: linkCodes.createdBy, expiresAt: linkCodes.expiresAt, usedAt: linkCodes.usedAt })
    .from(linkCodes)
    .where(eq(linkCodes.code, code))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    throw new UserFacingError("That code isn't valid anymore. Ask them to make a new one in Settings.");
  }
  if (row.createdBy === viewer.userId) throw new UserFacingError("That's your own code — send it to the person you're linking with.");

  const [creator] = await db
    .select({ id: users.id, role: users.role, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.createdBy))
    .limit(1);
  if (!creator) throw new UserFacingError("That code isn't valid anymore.");
  if (creator.role === viewer.role) {
    throw new UserFacingError(
      viewer.role === "student"
        ? "That code is from another student. A student links with a parent."
        : "That code is from another parent. A parent links with their student.",
    );
  }

  const studentId = viewer.role === "student" ? viewer.userId : creator.id;
  const parentId = viewer.role === "parent" ? viewer.userId : creator.id;
  const parentEmail = (viewer.role === "parent" ? viewer.email : creator.email).toLowerCase();

  await db.transaction(async (tx) => {
    // One to one, checked inside the transaction so two codes redeemed at
    // once can't both win.
    const taken = await tx
      .select({ id: parentStudentLinks.id })
      .from(parentStudentLinks)
      .where(
        and(
          eq(parentStudentLinks.status, "active"),
          or(eq(parentStudentLinks.studentId, studentId), eq(parentStudentLinks.parentId, parentId)),
        ),
      )
      .limit(1);
    if (taken.length) {
      throw new UserFacingError("One of you is already linked to someone. Unlink first in Settings.");
    }

    const now = new Date();
    const [previous] = await tx
      .select({ id: parentStudentLinks.id })
      .from(parentStudentLinks)
      .where(and(eq(parentStudentLinks.studentId, studentId), eq(parentStudentLinks.parentEmail, parentEmail)))
      .limit(1);
    const values = {
      parentId,
      status: "active" as const,
      inviteToken: randomBytes(32).toString("base64url"),
      acceptedAt: now,
      revokedAt: null,
      updatedAt: now,
    };
    // A pair that was linked before reuses its row: unique(student, parent email).
    if (previous) await tx.update(parentStudentLinks).set(values).where(eq(parentStudentLinks.id, previous.id));
    else await tx.insert(parentStudentLinks).values({ ...values, studentId, parentEmail });

    await tx.update(linkCodes).set({ usedAt: now, usedBy: viewer.userId }).where(eq(linkCodes.id, row.id));
    await tx.insert(accountEvents).values([
      { userId: studentId, actorId: viewer.userId, actorKind: "user", action: "link.created", detail: { parentId } },
      { userId: parentId, actorId: viewer.userId, actorKind: "user", action: "link.created", detail: { studentId } },
    ]);
  });

  return { name: creator.name, email: creator.email, role: creator.role as "student" | "parent", since: new Date() };
}

/**
 * End this viewer's link, from either side. Essays shared with the parent
 * are unshared too — a share shouldn't outlive the link that justified it —
 * and Pro stops being shared.
 */
export async function unlink(viewer: Viewer): Promise<void> {
  requireLinkable(viewer);
  const asStudent = viewer.role === "student";
  const [link] = await db
    .select()
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.status, "active"),
        eq(asStudent ? parentStudentLinks.studentId : parentStudentLinks.parentId, viewer.userId),
      ),
    )
    .limit(1);
  if (!link) throw new UserFacingError("You're not linked to anyone.");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(parentStudentLinks)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(eq(parentStudentLinks.id, link.id));
    if (link.parentId) {
      const owned = await tx.select({ id: essays.id }).from(essays).where(eq(essays.studentId, link.studentId));
      for (const e of owned) {
        await tx
          .update(essayShares)
          .set({ revokedAt: now, updatedAt: now })
          .where(and(eq(essayShares.essayId, e.id), eq(essayShares.grantedToUserId, link.parentId), isNull(essayShares.revokedAt)));
      }
      await tx.insert(accountEvents).values([
        { userId: link.studentId, actorId: viewer.userId, actorKind: "user", action: "link.ended", detail: { parentId: link.parentId } },
        { userId: link.parentId, actorId: viewer.userId, actorKind: "user", action: "link.ended", detail: { studentId: link.studentId } },
      ]);
    }
  });
}
