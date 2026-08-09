/* ————————————————————————————————————————
   Seed.

   Loads the reference data (schools, opportunities) from lib/data/ into
   Postgres, and creates a linked student + parent pair for local
   development. Idempotent: re-running upserts rather than duplicating.

   Run:  npm run db:seed
   ———————————————————————————————————————— */

import "./_env";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schools as schoolSeed } from "@/lib/data/schools";
import { opportunities as opportunitySeed } from "@/lib/data/opportunities";
import {
  activities,
  aidStatuses,
  coursePlanEntries,
  essays,
  listEntries,
  opportunities,
  parentProfiles,
  parentStudentLinks,
  recommenders,
  schoolAdmissions,
  schoolCosts,
  schoolDeadlines,
  schoolOutcomes,
  schools,
  studentProfiles,
  universalProfiles,
  users,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import type { ApplicationPlan } from "@/lib/types";

const CYCLE = "2026-27";

async function seedReferenceData() {
  console.log(`Seeding ${schoolSeed.length} schools…`);

  for (const s of schoolSeed) {
    await db
      .insert(schools)
      .values({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        city: s.city,
        state: s.state,
        region: s.region,
        type: s.type,
        setting: s.setting,
        size: s.size,
        undergradEnrollment: s.undergradEnrollment,
        photoQuery: s.photoQuery,
        topMajors: s.academics.topMajors,
        studentFacultyRatio: s.academics.studentFacultyRatio,
        notablePrograms: s.academics.notablePrograms,
        researchOpportunities: s.academics.researchOpportunities,
        coOp: s.academics.coOp,
        vibe: s.life.vibe,
        greekLifePresence: s.life.greekLifePresence,
        d1Athletics: s.life.d1Athletics,
        housingGuaranteed: s.life.housingGuaranteed,
        weather: s.life.weather,
        commonComplaints: s.life.commonComplaints,
        religiousAffiliation: s.life.religiousAffiliation ?? null,
        costOfLiving: s.cityInfo.costOfLiving,
        transit: s.cityInfo.transit,
        airportAccess: s.cityInfo.airportAccess,
        internshipMarket: s.cityInfo.internshipMarket,
        thingsToDo: s.cityInfo.thingsToDo,
        underratedFor: s.underratedFor ?? null,
      })
      .onConflictDoUpdate({
        target: schools.id,
        set: { name: s.name, updatedAt: new Date() },
      });

    await db
      .insert(schoolAdmissions)
      .values({
        schoolId: s.id,
        cycle: CYCLE,
        acceptanceRate: s.admissions.acceptanceRate,
        gpaMid50Low: s.admissions.gpaMid50[0],
        gpaMid50High: s.admissions.gpaMid50[1],
        satMid50Low: s.admissions.satMid50?.[0] ?? null,
        satMid50High: s.admissions.satMid50?.[1] ?? null,
        actMid50Low: s.admissions.actMid50?.[0] ?? null,
        actMid50High: s.admissions.actMid50?.[1] ?? null,
        testPolicy: s.admissions.testPolicy,
        plansOffered: s.admissions.plansOffered,
      })
      .onConflictDoNothing();

    for (const [plan, iso] of Object.entries(s.admissions.deadlines)) {
      if (!iso) continue;
      await db
        .insert(schoolDeadlines)
        .values({ schoolId: s.id, cycle: CYCLE, plan: plan as ApplicationPlan, dueDate: iso })
        .onConflictDoNothing();
    }

    await db
      .insert(schoolCosts)
      .values({
        schoolId: s.id,
        year: CYCLE,
        stickerPrice: s.cost.stickerPrice,
        avgNetPrice: s.cost.avgNetPrice,
        netPriceUnder48k: s.cost.netPriceByIncome.under48k,
        netPrice48to75k: s.cost.netPriceByIncome.k48to75,
        netPrice75to110k: s.cost.netPriceByIncome.k75to110,
        netPriceOver110k: s.cost.netPriceByIncome.over110k,
        percentNeedMet: s.cost.percentNeedMet,
        meritAid: s.cost.meritAid,
      })
      .onConflictDoNothing();

    await db
      .insert(schoolOutcomes)
      .values({
        schoolId: s.id,
        year: CYCLE,
        gradRate: s.outcomes.gradRate,
        medianEarnings10yr: s.outcomes.medianEarnings10yr,
        alumniNetwork: s.outcomes.alumniNetwork,
      })
      .onConflictDoNothing();
  }

  console.log(`Seeding ${opportunitySeed.length} opportunities…`);
  for (const [i, o] of opportunitySeed.entries()) {
    await db
      .insert(opportunities)
      .values({ ...o, sortOrder: i })
      .onConflictDoUpdate({ target: opportunities.id, set: { name: o.name, sortOrder: i } });
  }
}

/** Create a user through Better Auth so the password is hashed correctly. */
async function ensureUser(email: string, password: string, name: string, role: "student" | "parent") {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing.id;

  const result = await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(users).set({ role }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function seedDevAccounts() {
  console.log("Seeding dev accounts…");

  const studentId = await ensureUser("maya@example.com", "correct-horse-battery", "Maya Chen", "student");
  const parentId = await ensureUser("dad@example.com", "correct-horse-battery", "David Chen", "parent");

  // The demo student from the old in-memory seed.
  await db
    .insert(studentProfiles)
    .values({
      userId: studentId,
      firstName: "Maya",
      gradeLevel: 12,
      selfReportedGpaUnweighted: 3.6,
      selfReportedGpaWeighted: 4.1,
      apCount: 5,
      honorsCount: 3,
      sat: 1310,
      planningToTest: false,
      intendedMajors: ["Biology"],
      regions: ["midwest", "northeast"],
      maxDistanceMiles: 500,
      campusSizes: ["medium", "large"],
      campusSettings: ["college-town", "suburban"],
      budgetMaxPerYear: 30000,
      willFileFafsa: true,
      values: ["research-access", "mental-health-support", "study-abroad"],
    })
    .onConflictDoNothing();

  await db
    .insert(parentProfiles)
    .values({
      userId: parentId,
      firstName: "David",
      relationship: "father",
      studentGrade: 12,
      budgetPerYear: 30000,
      priorities: ["Cost", "Fit"],
      biggestWorry: "That we can't afford the schools she loves",
      involvementLevel: "regular-check-ins",
    })
    .onConflictDoNothing();

  await db
    .insert(parentStudentLinks)
    .values({
      studentId,
      parentId,
      parentEmail: "dad@example.com",
      inviteToken: randomBytes(32).toString("base64url"),
      status: "active",
      acceptedAt: new Date(),
    })
    .onConflictDoNothing();

  await db.insert(aidStatuses).values({ studentId, fafsa: "in-progress" }).onConflictDoNothing();

  const list: Array<[string, "reach" | "target" | "likely", ApplicationPlan, "considering" | "in-progress" | "submitted" | "materials-received"]> = [
    ["umich", "reach", "EA", "in-progress"],
    ["case-western", "target", "EA", "submitted"],
    ["wisconsin", "target", "EA", "in-progress"],
    ["college-of-wooster", "likely", "EA", "submitted"],
    ["miami-ohio", "likely", "EA", "materials-received"],
    ["pitt", "target", "rolling", "considering"],
  ];
  for (const [schoolId, tier, plan, status] of list) {
    await db
      .insert(listEntries)
      .values({ studentId, schoolId, tier, plan, status })
      .onConflictDoNothing();
  }

  const existingEssays = await db.select().from(essays).where(eq(essays.studentId, studentId));
  if (existingEssays.length === 0) {
    await db.insert(essays).values([
      {
        studentId,
        title: "Personal statement",
        promptText: "Share an essay on any topic of your choice.",
        wordLimit: 650,
        text: "The vet clinic smells like antiseptic and wet dog...",
      },
      {
        studentId,
        title: "Case Western supplement",
        promptText: "How will you use the Case Western experience to support your interests?",
        wordLimit: 300,
        text: "",
      },
    ]);
  }

  const existingRecs = await db.select().from(recommenders).where(eq(recommenders.studentId, studentId));
  if (existingRecs.length === 0) {
    await db.insert(recommenders).values([
      { studentId, name: "Ms. Patel", roleTitle: "AP Biology teacher", type: "teacher", status: "submitted" },
      { studentId, name: "Mr. Donnelly", roleTitle: "School counselor", type: "counselor", status: "in-progress" },
    ]);
  }

  const existingActivities = await db.select().from(activities).where(eq(activities.studentId, studentId));
  if (existingActivities.length === 0) {
    await db.insert(activities).values([
      { studentId, name: "Science Olympiad", role: "Team captain", hoursPerWeek: 6, weeksPerYear: 30, yearsInvolved: [10, 11, 12], leadership: true, description: "Anatomy and physiology events" },
      { studentId, name: "Hospital volunteering", role: "Volunteer", hoursPerWeek: 4, weeksPerYear: 40, yearsInvolved: [11, 12], leadership: false, description: "Patient transport and front desk" },
      { studentId, name: "Vet clinic job", role: "Kennel assistant", hoursPerWeek: 10, weeksPerYear: 50, yearsInvolved: [11, 12], leadership: false, description: "Paid position, evenings and weekends" },
    ]);
  }

  const existingCourses = await db.select().from(coursePlanEntries).where(eq(coursePlanEntries.studentId, studentId));
  if (existingCourses.length === 0) {
    await db.insert(coursePlanEntries).values([
      { studentId, year: 10, subject: "Math", name: "Algebra II", level: "regular", status: "completed", grade: "A-" },
      { studentId, year: 11, subject: "Science", name: "AP Biology", level: "ap", status: "completed", grade: "A" },
      { studentId, year: 11, subject: "English", name: "AP Language", level: "ap", status: "completed", grade: "A-" },
      { studentId, year: 12, subject: "Science", name: "AP Chemistry", level: "ap", status: "in-progress" },
      { studentId, year: 12, subject: "Math", name: "AP Statistics", level: "ap", status: "in-progress" },
      { studentId, year: 12, subject: "English", name: "AP Literature", level: "ap", status: "in-progress" },
    ]);
  }

  await db.insert(universalProfiles).values({
    studentId,
    legalName: "Maya Chen",
    preferredName: "Maya",
    dateOfBirth: "2009-03-14",
    highSchoolName: "Jefferson High School",
    highSchoolCity: "Columbus, OH",
    gradYear: "2027",
    honors: ["National Honor Society", "AP Scholar"],
  }).onConflictDoNothing();

  console.log(`  student: maya@example.com / correct-horse-battery`);
  console.log(`  parent:  dad@example.com  / correct-horse-battery  (linked)`);
}

async function main() {
  await seedReferenceData();
  await seedDevAccounts();
  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
