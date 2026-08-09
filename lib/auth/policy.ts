/* ————————————————————————————————————————
   The privacy boundary.

   The product rule, from the README and the UI copy:
     "Parents never see the student's private counselor chat or draft essays
      unless shared."

   Before this file, that rule was copy. `parentLinked` was a boolean read
   only by its own toggle, `shareEssays` was read nowhere, and the six
   role checks in the app were `role === "student" ? x : null` in the render
   path — which run *after* the data has already been sent to the browser.

   Two rules govern everything here:

   1. Authorization is resolved before data is fetched, never after. A parent
      session must not load essay text into the client at all.
   2. Deny by default. `assertCanRead` throws unless a rule explicitly grants
      access, so a resource nobody thought about is private, not public.
   ———————————————————————————————————————— */

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { essayShares, essays, parentStudentLinks } from "@/lib/db/schema";
import type { Role } from "@/lib/types";

export class AuthzError extends Error {
  constructor(message = "Not permitted") {
    super(message);
    this.name = "AuthzError";
  }
}

export interface Viewer {
  userId: string;
  role: Role;
  email: string;
  name: string;
}

/** The signed-in user, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    role: (session.user as { role?: Role }).role ?? "student",
    email: session.user.email,
    name: session.user.name,
  };
}

/** The signed-in user, or throw. Use in every server action. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthzError("Not signed in");
  return viewer;
}

export async function requireStudent(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "student") throw new AuthzError("Students only");
  return viewer;
}

/* ————————————— Linkage ————————————— */

/** Is this parent actively linked to this student? Revoked links don't count. */
export async function isLinkedParent(parentId: string, studentId: string): Promise<boolean> {
  const [link] = await db
    .select({ id: parentStudentLinks.id })
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.parentId, parentId),
        eq(parentStudentLinks.studentId, studentId),
        eq(parentStudentLinks.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(link);
}

/** The student whose data a parent is viewing, or null if unlinked. */
export async function linkedStudentIdFor(parentId: string): Promise<string | null> {
  const [link] = await db
    .select({ studentId: parentStudentLinks.studentId })
    .from(parentStudentLinks)
    .where(
      and(eq(parentStudentLinks.parentId, parentId), eq(parentStudentLinks.status, "active")),
    )
    .limit(1);
  return link?.studentId ?? null;
}

/**
 * Which student's records is this viewer allowed to read?
 * A student reads their own. A parent reads their linked student's — and
 * only the subject areas marked shared below.
 */
export async function subjectStudentId(viewer: Viewer): Promise<string | null> {
  if (viewer.role === "student") return viewer.userId;
  return linkedStudentIdFor(viewer.userId);
}

/* ————————————— The resource table ————————————— */

/**
 * Every resource the app stores, and who may read it.
 *
 * `shared` resources are the ones the UI copy promises a linked parent can
 * see: "the list, statuses, and deadlines", plus the Decide worksheet, which
 * app/(app)/decide/page.tsx states is "in the shared view a linked parent can
 * see" and is "built for the kitchen table".
 *
 * Everything else is student-private. The three the copy never addresses —
 * universalProfile (DOB, address, parentEducation), activities, and
 * coursePlan — default to private here, which is the safe direction. Aid data
 * is shared because families decide cost together.
 */
export type Resource =
  // shared with a linked parent
  | "listEntries"
  | "schoolDeadlines"
  | "aidStatus"
  | "aidOffers"
  | "decisionNotes"
  // student-private
  | "counselorThreads"
  | "essays"
  | "essayVersions"
  | "essayFeedback"
  | "interviewTurns"
  | "throughline"
  | "aboutYouPanel"
  | "universalProfile"
  | "activities"
  | "coursePlan"
  | "checkIns"
  | "preferences";

const PARENT_READABLE: ReadonlySet<Resource> = new Set<Resource>([
  "listEntries",
  "schoolDeadlines",
  "aidStatus",
  "aidOffers",
  "decisionNotes",
]);

/**
 * Can `viewer` read `resource` belonging to `ownerStudentId`?
 * Essays are excluded here on purpose — a per-essay grant can override the
 * default, so they go through canReadEssay().
 */
export async function canRead(
  viewer: Viewer,
  resource: Resource,
  ownerStudentId: string,
): Promise<boolean> {
  if (viewer.role === "student") return viewer.userId === ownerStudentId;
  if (!PARENT_READABLE.has(resource)) return false;
  return isLinkedParent(viewer.userId, ownerStudentId);
}

export async function assertCanRead(
  viewer: Viewer,
  resource: Resource,
  ownerStudentId: string,
): Promise<void> {
  if (!(await canRead(viewer, resource, ownerStudentId))) {
    throw new AuthzError(`Not permitted to read ${resource}`);
  }
}

/** Only the owning student may write. Parents have no write path to student data. */
export async function assertCanWrite(viewer: Viewer, ownerStudentId: string): Promise<void> {
  if (viewer.role !== "student" || viewer.userId !== ownerStudentId) {
    throw new AuthzError("Not permitted to modify this");
  }
}

/* ————————————— Essays: the per-grant exception ————————————— */

/**
 * A parent may read an essay only via an explicit, unrevoked share.
 *
 * The copy is contradictory — apply/page.tsx says "unless you share it"
 * (per-draft) while the settings toggle reads as global. Per-essay is the
 * stricter reading and satisfies both.
 */
export async function canReadEssay(viewer: Viewer, essayId: string): Promise<boolean> {
  const [essay] = await db
    .select({ studentId: essays.studentId })
    .from(essays)
    .where(eq(essays.id, essayId))
    .limit(1);
  if (!essay) return false;

  if (viewer.role === "student") return viewer.userId === essay.studentId;

  if (!(await isLinkedParent(viewer.userId, essay.studentId))) return false;

  const [share] = await db
    .select({ id: essayShares.id })
    .from(essayShares)
    .where(
      and(
        eq(essayShares.essayId, essayId),
        eq(essayShares.grantedToUserId, viewer.userId),
        isNull(essayShares.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(share);
}

export async function assertCanReadEssay(viewer: Viewer, essayId: string): Promise<void> {
  if (!(await canReadEssay(viewer, essayId))) {
    throw new AuthzError("Not permitted to read this essay");
  }
}

/**
 * Version history leaks drafts too. A parent sees only versions saved at or
 * after the moment the essay was shared — sharing a finished draft must not
 * hand over every earlier revision.
 */
export async function essayVersionCutoff(
  viewer: Viewer,
  essayId: string,
): Promise<{ allowed: false } | { allowed: true; since: Date | null }> {
  if (!(await canReadEssay(viewer, essayId))) return { allowed: false };
  if (viewer.role === "student") return { allowed: true, since: null };

  const [share] = await db
    .select({ sharedAt: essayShares.sharedAt })
    .from(essayShares)
    .where(
      and(
        eq(essayShares.essayId, essayId),
        eq(essayShares.grantedToUserId, viewer.userId),
        isNull(essayShares.revokedAt),
      ),
    )
    .limit(1);
  return share ? { allowed: true, since: share.sharedAt } : { allowed: false };
}

/* ————————————— Route guards ————————————— */

/** Routes a parent must never reach, regardless of linkage. */
export const STUDENT_ONLY_ROUTES = ["/counselor", "/interviews"] as const;

export function isStudentOnlyRoute(pathname: string): boolean {
  return STUDENT_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
