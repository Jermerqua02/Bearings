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

/**
 * The caller must own a student record — i.e. not be a parent.
 *
 * The boundary this enforces is "a parent has no write path to a student's
 * data, and no access to the counselor". It was written as `role !==
 * "student"`, which also locked out admins: an operator walking the product
 * hit "Students only" on every counselor message and every list write, while
 * onboarding — which doesn't come through here — let them in and saved their
 * answers. Same shape as the canRead bug, in the other direction.
 *
 * Parents are still refused, which is the part that matters. Everything here
 * acts on the caller's own records.
 */
export async function requireStudent(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role === "parent") throw new AuthzError("Students only");
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
 *
 * Uploaded transcripts sit with coursePlan, and would be private even if the
 * plan were shared: the file is a school record with far more on it than
 * course names.
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
  | "transcripts"
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
  /*
    Your own records are yours, whatever your role.

    This used to read `viewer.role === "student" && viewer.userId === owner`,
    so an admin fell through to the parent branch and was denied their own
    profile. The effect was subtle and total: an operator who walked
    onboarding saved a profile fine, then found the explorer telling them to
    set one up, because the read threw and the caller treated the failure as
    "no profile yet".

    The boundary exists to stop *cross-account* reads. Someone reading rows
    they created themselves is not what it guards — which loadSnapshot
    already said in a comment while the rule here disagreed.
  */
  if (viewer.userId === ownerStudentId) return true;

  // Beyond that, only a linked parent, and only the shared slices.
  if (viewer.role === "student") return false;
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

/** Only the owner may write. Parents have no write path to student data. */
export async function assertCanWrite(viewer: Viewer, ownerStudentId: string): Promise<void> {
  // Same rule as canRead: your own rows are yours. Role-gating this denied an
  // admin every write to data they own — adding a school to their own list,
  // saving their own essay — while onboarding, which doesn't go through here,
  // saved happily. Half a working account is worse than none.
  if (viewer.userId !== ownerStudentId) {
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

  // The author, whatever their role. Same reason as canRead.
  if (viewer.userId === essay.studentId) return true;
  if (viewer.role === "student") return false;

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
