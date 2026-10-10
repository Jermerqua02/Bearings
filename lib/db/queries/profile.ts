/* ————————————————————————————————————————
   Writing a profile.

   Split out from the server action so the write can be exercised directly
   by scripts/test-onboarding.ts without a request context — the action's
   only remaining job is resolving who the viewer is.

   Upsert, not insert: re-running onboarding should correct a profile
   rather than collide with it.
   ———————————————————————————————————————— */

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parentProfiles, studentProfiles } from "@/lib/db/schema";
import { isUsState } from "@/lib/states";
import type { CampusSetting, Profile, Region, SchoolSize } from "@/lib/types";

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  if (profile.role === "parent") {
    const row = {
      userId,
      firstName: profile.firstName || "there",
      relationship: profile.relationship || "parent",
      studentGrade: profile.studentGrade ?? 11,
      budgetPerYear: profile.budgetPerYear ?? null,
      priorities: profile.priorities ?? [],
      biggestWorry: profile.biggestWorry ?? "",
      involvementLevel: profile.involvementLevel ?? "regular-check-ins",
      // As for a student: only when given, and only a real code.
      ...(isUsState(profile.homeState) ? { homeState: profile.homeState } : {}),
    };
    await db
      .insert(parentProfiles)
      .values(row)
      .onConflictDoUpdate({
        target: parentProfiles.userId,
        set: { ...row, updatedAt: new Date() },
      });
    return;
  }

  const row = {
    userId,
    firstName: profile.firstName || "there",
    gradeLevel: profile.gradeLevel ?? 11,
    selfReportedGpaUnweighted: profile.gpa?.unweighted ?? null,
    selfReportedGpaWeighted: profile.gpa?.weighted ?? null,
    apCount: profile.rigor?.apCount ?? 0,
    ibCount: profile.rigor?.ibCount ?? 0,
    honorsCount: profile.rigor?.honorsCount ?? 0,
    sat: profile.testScores?.sat ?? null,
    act: profile.testScores?.act ?? null,
    planningToTest: profile.testScores?.planningToTest ?? false,
    intendedMajors: profile.intendedMajors ?? [],
    undecided: profile.undecided ?? false,
    regions: (profile.geography?.regions ?? []) as Region[],
    campusSizes: (profile.campus?.sizes ?? []) as SchoolSize[],
    campusSettings: (profile.campus?.settings ?? []) as CampusSetting[],
    budgetMaxPerYear: profile.budget?.maxPerYear ?? null,
    willFileFafsa: profile.budget?.willFileFafsa ?? true,
    values: profile.values ?? [],
    // Only when given: re-running onboarding from an older client mustn't
    // erase a state the student set since. It comes from the client, so
    // only a real code is kept — anything else would mis-price every school.
    ...(isUsState(profile.homeState) ? { homeState: profile.homeState } : {}),
  };

  await db
    .insert(studentProfiles)
    .values(row)
    .onConflictDoUpdate({
      target: studentProfiles.userId,
      set: { ...row, updatedAt: new Date() },
    });
}

/**
 * The home state on its own — a student's or a parent's — asked once of profiles made before
 * onboarding asked it, and changeable any time after. Null clears it.
 */
export async function setHomeState(userId: string, homeState: string | null, role: "student" | "parent" = "student") {
  if (role === "parent") {
    const rows = await db
      .update(parentProfiles)
      .set({ homeState, updatedAt: new Date() })
      .where(eq(parentProfiles.userId, userId))
      .returning({ userId: parentProfiles.userId });
    return rows.length > 0;
  }
  const rows = await db
    .update(studentProfiles)
    .set({ homeState, updatedAt: new Date() })
    .where(eq(studentProfiles.userId, userId))
    .returning({ userId: studentProfiles.userId });
  return rows.length > 0;
}
