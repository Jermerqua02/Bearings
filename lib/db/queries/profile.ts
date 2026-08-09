/* ————————————————————————————————————————
   Writing a profile.

   Split out from the server action so the write can be exercised directly
   by scripts/test-onboarding.ts without a request context — the action's
   only remaining job is resolving who the viewer is.

   Upsert, not insert: re-running onboarding should correct a profile
   rather than collide with it.
   ———————————————————————————————————————— */

import "server-only";

import { db } from "@/lib/db";
import { parentProfiles, studentProfiles } from "@/lib/db/schema";
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
  };

  await db
    .insert(studentProfiles)
    .values(row)
    .onConflictDoUpdate({
      target: studentProfiles.userId,
      set: { ...row, updatedAt: new Date() },
    });
}
