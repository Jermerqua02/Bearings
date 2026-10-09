/* ————————————————————————————————————————
   Reading schools.

   These tables were write-only. `school_admissions`, `school_cost` and
   `school_outcome` were populated by the seed script and read by nothing
   at all — every school fact in the product came from the forty-entry
   array compiled into `lib/data/schools.ts`, so imported institutions were
   invisible no matter how many of them landed in Postgres.

   Rows are assembled back into the `School` shape from `lib/types.ts`
   rather than a new one, so the components that render them don't need to
   know where the data came from.

   Missing children are the normal case, not an error: an institution that
   reported no cost figures has no `school_cost` row, and its `cost` object
   comes back with undefined values. `coverage` says which slices are real,
   for the few places that need to distinguish "nothing" from "zero".
   ———————————————————————————————————————— */

import "server-only";

import { and, asc, count, desc, eq, gt, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  schoolAdmissions,
  schoolApplications,
  schoolTuitionPrograms,
  schoolCosts,
  schoolDeadlines,
  schoolOutcomes,
  schools,
} from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";
import type {
  ApplicationPlan,
  ApplicationPlatform,
  CampusSetting,
  ChanceTier,
  FactSource,
  Region,
  Requirement,
  School,
  SchoolApplication,
  SchoolSize,
  SchoolType,
  StudentProfile,
} from "@/lib/types";

type SchoolRow = typeof schools.$inferSelect;
type AdmissionsRow = typeof schoolAdmissions.$inferSelect;
type CostRow = typeof schoolCosts.$inferSelect;
type OutcomeRow = typeof schoolOutcomes.$inferSelect;
type DeadlineRow = typeof schoolDeadlines.$inferSelect;
type ApplicationRow = typeof schoolApplications.$inferSelect;
type ProgramRow = typeof schoolTuitionPrograms.$inferSelect;

/** Which cycle-scoped slices came from a real row. */
export interface Coverage {
  admissions: boolean;
  cost: boolean;
  outcomes: boolean;
  application: boolean;
}

export interface SchoolRecord extends School {
  coverage: Coverage;
}

/** A pair only when both ends are present — a half range is not a range. */
function pair(low: number | null, high: number | null): [number, number] | undefined {
  return low != null && high != null ? [low, high] : undefined;
}

/** null → undefined, so the domain shape carries one absence, not two. */
function opt<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

function toApplication(row: ApplicationRow | undefined): SchoolApplication | undefined {
  if (!row) return undefined;
  return {
    platform: opt(row.platform) as ApplicationPlatform | undefined,
    url: opt(row.applicationUrl),
    netPriceCalculatorUrl: opt(row.netPriceCalculatorUrl),
    openAdmissions: opt(row.openAdmissions),
    requires: {
      essay: opt(row.reqEssay) as Requirement | undefined,
      recommendations: opt(row.reqRecommendations) as Requirement | undefined,
      transcript: opt(row.reqTranscript) as Requirement | undefined,
      testScores: opt(row.reqTestScores) as Requirement | undefined,
      gpa: opt(row.reqGpa) as Requirement | undefined,
      classRank: opt(row.reqClassRank) as Requirement | undefined,
    },
    teacherRecs: opt(row.teacherRecs),
    otherRecs: opt(row.otherRecs),
    counselorRec: opt(row.counselorRec),
    midyearReport: opt(row.midyearReport),
    writingSupplement: opt(row.writingSupplement),
    coursesAndGrades: opt(row.coursesAndGrades),
    portfolio: opt(row.portfolio),
    fee: opt(row.feeUsd),
    feeInternational: opt(row.feeInternationalUsd),
    feeWaiver: opt(row.feeWaiver),
    feeYear: opt(row.feeYear),
    requirementsYear: opt(row.requirementsYear),
    sources: {
      requirements: opt(row.requirementsSource) as FactSource | undefined,
      supplements: opt(row.supplementsSource) as FactSource | undefined,
      fee: opt(row.feeSource) as FactSource | undefined,
      url: opt(row.urlSource) as FactSource | undefined,
    },
  };
}

function assemble(
  row: SchoolRow,
  adm: AdmissionsRow | undefined,
  cost: CostRow | undefined,
  out: OutcomeRow | undefined,
  deadlines: DeadlineRow[],
  app?: ApplicationRow,
  programs: ProgramRow[] = [],
): SchoolRecord {
  const byPlan: Partial<Record<ApplicationPlan, string>> = {};
  for (const d of deadlines) {
    // `date` columns come back as strings; String() keeps that true if the
    // driver's mode ever changes, the way snapshot.ts does for weekOf.
    byPlan[d.plan as ApplicationPlan] = String(d.dueDate);
  }

  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    region: row.region as Region,
    type: row.type as SchoolType,
    setting: row.setting as CampusSetting,
    size: row.size as SchoolSize,
    undergradEnrollment: row.undergradEnrollment,
    photoQuery: row.photoQuery,
    admissions: {
      acceptanceRate: adm?.acceptanceRate ?? undefined,
      gpaMid50: adm ? pair(adm.gpaMid50Low, adm.gpaMid50High) : undefined,
      satMid50: adm ? pair(adm.satMid50Low, adm.satMid50High) : undefined,
      actMid50: adm ? pair(adm.actMid50Low, adm.actMid50High) : undefined,
      testPolicy: (adm?.testPolicy ?? "optional") as School["admissions"]["testPolicy"],
      plansOffered: (adm?.plansOffered ?? []) as ApplicationPlan[],
      deadlines: byPlan,
    },
    cost: {
      stickerPrice: cost?.stickerPrice ?? undefined,
      avgNetPrice: cost?.avgNetPrice ?? undefined,
      netPriceByIncome: {
        under48k: cost?.netPriceUnder48k ?? undefined,
        k48to75: cost?.netPrice48to75k ?? undefined,
        k75to110: cost?.netPrice75to110k ?? undefined,
        over110k: cost?.netPriceOver110k ?? undefined,
      },
      percentNeedMet: cost?.percentNeedMet ?? undefined,
      meritAid: (cost?.meritAid ?? undefined) as School["cost"]["meritAid"],
      tuitionInState: cost?.tuitionInState ?? undefined,
      tuitionOutOfState: cost?.tuitionOutOfState ?? undefined,
      tuitionPrograms: programs.length
        ? programs.map((p) => ({
            program: p.program,
            eligibleStates: p.eligibleStates,
            restrictions: p.restrictions ?? undefined,
            url: p.url ?? undefined,
          }))
        : undefined,
    },
    academics: {
      topMajors: row.topMajors,
      studentFacultyRatio: row.studentFacultyRatio,
      notablePrograms: row.notablePrograms,
      researchOpportunities: row.researchOpportunities ?? undefined,
      coOp: row.coOp ?? undefined,
    },
    life: {
      vibe: row.vibe,
      greekLifePresence: (row.greekLifePresence ?? undefined) as School["life"]["greekLifePresence"],
      d1Athletics: row.d1Athletics ?? undefined,
      housingGuaranteed: row.housingGuaranteed ?? undefined,
      weather: row.weather,
      commonComplaints: row.commonComplaints,
      religiousAffiliation: row.religiousAffiliation ?? undefined,
    },
    cityInfo: {
      costOfLiving: (row.costOfLiving ?? undefined) as School["cityInfo"]["costOfLiving"],
      transit: row.transit,
      airportAccess: row.airportAccess,
      internshipMarket: row.internshipMarket,
      thingsToDo: row.thingsToDo,
    },
    outcomes: {
      gradRate: out?.gradRate ?? undefined,
      gradRate4yr: out?.gradRate4yr ?? undefined,
      medianEarnings10yr: out?.medianEarnings10yr ?? undefined,
      alumniNetwork: (out?.alumniNetwork ?? undefined) as School["outcomes"]["alumniNetwork"],
    },
    underratedFor: row.underratedFor ?? undefined,
    application: toApplication(app),
    coverage: { admissions: !!adm, cost: !!cost, outcomes: !!out, application: !!app },
  };
}

/**
 * Several schools at once, in one round trip per table.
 *
 * The student's own pages resolve a whole list this way — awaiting per
 * school inside a map would be one query per row.
 */
export async function getSchoolsByIds(ids: string[]): Promise<SchoolRecord[]> {
  // inArray with an empty array builds invalid SQL.
  if (ids.length === 0) return [];

  const [rows, adm, cost, out, dl, app, programs] = await Promise.all([
    db.select().from(schools).where(inArray(schools.id, ids)),
    db
      .select()
      .from(schoolAdmissions)
      .where(
        and(inArray(schoolAdmissions.schoolId, ids), eq(schoolAdmissions.cycle, CURRENT_CYCLE)),
      ),
    db
      .select()
      .from(schoolCosts)
      .where(and(inArray(schoolCosts.schoolId, ids), eq(schoolCosts.year, CURRENT_CYCLE))),
    db
      .select()
      .from(schoolOutcomes)
      .where(and(inArray(schoolOutcomes.schoolId, ids), eq(schoolOutcomes.year, CURRENT_CYCLE))),
    db
      .select()
      .from(schoolDeadlines)
      .where(and(inArray(schoolDeadlines.schoolId, ids), eq(schoolDeadlines.cycle, CURRENT_CYCLE))),
    db
      .select()
      .from(schoolApplications)
      .where(
        and(inArray(schoolApplications.schoolId, ids), eq(schoolApplications.cycle, CURRENT_CYCLE)),
      ),
    db.select().from(schoolTuitionPrograms).where(inArray(schoolTuitionPrograms.schoolId, ids)),
  ]);

  const admBy = new Map(adm.map((r) => [r.schoolId, r]));
  const costBy = new Map(cost.map((r) => [r.schoolId, r]));
  const outBy = new Map(out.map((r) => [r.schoolId, r]));
  const appBy = new Map(app.map((r) => [r.schoolId, r]));
  const programsBy = new Map<string, ProgramRow[]>();
  for (const p of programs) programsBy.set(p.schoolId, [...(programsBy.get(p.schoolId) ?? []), p]);
  const dlBy = new Map<string, DeadlineRow[]>();
  for (const d of dl) {
    const list = dlBy.get(d.schoolId) ?? [];
    list.push(d);
    dlBy.set(d.schoolId, list);
  }

  return rows.map((r) =>
    assemble(
      r,
      admBy.get(r.id),
      costBy.get(r.id),
      outBy.get(r.id),
      dlBy.get(r.id) ?? [],
      appBy.get(r.id),
      programsBy.get(r.id) ?? [],
    ),
  );
}

export async function getSchoolById(id: string): Promise<SchoolRecord | null> {
  const [one] = await getSchoolsByIds([id]);
  return one ?? null;
}

export async function getSchoolMap(ids: string[]): Promise<Map<string, SchoolRecord>> {
  const rows = await getSchoolsByIds(ids);
  return new Map(rows.map((s) => [s.id, s]));
}

/* ————————————— Search ————————————— */

export type SortKey = "fit" | "selectivity" | "cost" | "name";

export interface SchoolSearchCriteria {
  tiers?: ChanceTier[];
  regions?: Region[];
  sizes?: SchoolSize[];
  settings?: CampusSetting[];
  types?: SchoolType[];
  /** Max average net price. 0 or undefined means no cap. */
  costCap?: number;
  testOptionalOnly?: boolean;
  /** Free-text match on name or city. */
  q?: string;
  sort?: SortKey;
  page?: number;
  perPage?: number;
}

export interface SchoolSearchResult {
  schools: SchoolRecord[];
  /** Matches across the whole filter, not just this page. */
  total: number;
  page: number;
  pageCount: number;
}

/**
 * The student's side of the chance calculation, as SQL.
 *
 * This is a transcription of `chanceTier` in lib/match.ts. It has to exist
 * because the tier depends on the student's numbers as well as the school's,
 * so it can't be precomputed into a column — and it has to be SQL rather
 * than a filter applied afterwards, because filtering a page after fetching
 * it returns short pages and a wrong total.
 *
 * Kept honest by scripts/test-schools.ts, which runs both implementations
 * over every school and asserts they agree.
 */
function tierExpr(profile: StudentProfile): SQL<string | null> {
  const gpa = profile.gpa.unweighted;
  const sat = profile.testScores.sat;
  const act = profile.testScores.act;
  const rigor =
    profile.rigor.apCount + profile.rigor.ibCount + profile.rigor.honorsCount;
  const rigorBonus = rigor >= 8 ? 1 : 0;

  const A = schoolAdmissions;

  // GPA contributes only when the student has one and the school published a
  // range. Same for the test signal, which prefers SAT exactly as the JS does.
  const gpaPoints =
    gpa === undefined
      ? sql`0`
      : sql`(case when ${A.gpaMid50Low} is null or ${A.gpaMid50High} is null then 0
                  when ${gpa} >= ${A.gpaMid50High} then 2
                  when ${gpa} >= ${A.gpaMid50Low} then 1
                  when ${gpa} >= ${A.gpaMid50Low} - 0.25 then 0
                  else -1 end)`;
  const gpaSignal =
    gpa === undefined
      ? sql`0`
      : sql`(case when ${A.gpaMid50Low} is null or ${A.gpaMid50High} is null then 0 else 1 end)`;

  const satUsable = sql`(${sat ?? null}::real is not null and ${A.satMid50Low} is not null and ${A.satMid50High} is not null)`;
  const actUsable = sql`(${act ?? null}::real is not null and ${A.actMid50Low} is not null and ${A.actMid50High} is not null)`;

  const testPoints = sql`(case
      when ${satUsable} then (case when ${sat ?? null}::real >= ${A.satMid50High} then 2
                                   when ${sat ?? null}::real >= ${A.satMid50Low} then 1
                                   else -1 end)
      when ${actUsable} then (case when ${act ?? null}::real >= ${A.actMid50High} then 2
                                   when ${act ?? null}::real >= ${A.actMid50Low} then 1
                                   else -1 end)
      else 0 end)`;
  const testSignal = sql`(case when ${satUsable} or ${actUsable} then 1 else 0 end)`;

  // The rigor bonus adds to points without adding a signal, so it shifts the
  // average — matching the JS, deliberately, rather than improving on it.
  const points = sql`(${gpaPoints} + ${testPoints} + ${rigorBonus})`;
  const signals = sql`(${gpaSignal} + ${testSignal})`;
  const avg = sql`(case when ${signals} > 0 then ${points}::real / ${signals} else 0 end)`;

  return sql`(case
      when ${A.acceptanceRate} is null then null
      when ${A.acceptanceRate} < 0.1 then 'reach'
      -- No signals: the school's own selectivity is the only honest read.
      -- Must mirror the same branch in chanceRead, or scripts/test-schools.ts
      -- fails — which is the point of that test.
      when ${signals} = 0 then (case when ${A.acceptanceRate} >= 0.75 then 'likely'
                                     when ${A.acceptanceRate} >= 0.45 then 'target'
                                     else 'reach' end)
      when ${A.acceptanceRate} < 0.25 then (case when ${avg} >= 1.4 then 'target' else 'reach' end)
      when ${A.acceptanceRate} < 0.5 then (case when ${avg} >= 1.4 then 'likely'
                                                when ${avg} >= 0.6 then 'target'
                                                else 'reach' end)
      else (case when ${avg} >= 0.9 then 'likely'
                 when ${avg} >= 0 then 'target'
                 else 'reach' end)
    end)`;
}

/**
 * Filtered, sorted, paginated.
 *
 * Only schools with an admissions row are returned: without an admit rate
 * there is no honest chance tier, and the explorer's whole premise is
 * telling a student where they stand.
 */
export async function searchSchools(
  profile: StudentProfile,
  criteria: SchoolSearchCriteria = {},
): Promise<SchoolSearchResult> {
  const perPage = criteria.perPage ?? 24;
  const page = Math.max(1, criteria.page ?? 1);
  const tier = tierExpr(profile);

  const filters: SQL[] = [
    eq(schoolAdmissions.cycle, CURRENT_CYCLE),
    isNotNull(schoolAdmissions.acceptanceRate),
  ];

  if (criteria.regions?.length) filters.push(inArray(schools.region, criteria.regions));
  if (criteria.sizes?.length) filters.push(inArray(schools.size, criteria.sizes));
  if (criteria.settings?.length) filters.push(inArray(schools.setting, criteria.settings));
  if (criteria.types?.length) filters.push(inArray(schools.type, criteria.types));
  if (criteria.tiers?.length) {
    filters.push(sql`${tier} in (${sql.join(criteria.tiers.map((t) => sql`${t}`), sql`, `)})`);
  }
  if (criteria.costCap) {
    // A school that reported no net price can't be shown to meet a budget.
    filters.push(lte(schoolCosts.avgNetPrice, criteria.costCap));
  }
  if (criteria.testOptionalOnly) {
    filters.push(sql`${schoolAdmissions.testPolicy} <> 'required'`);
  }
  if (criteria.q?.trim()) {
    const needle = `%${criteria.q.trim().toLowerCase()}%`;
    filters.push(
      or(
        sql`lower(${schools.name}) like ${needle}`,
        sql`lower(${schools.city}) like ${needle}`,
      )!,
    );
  }

  const where = and(...filters);

  // Every order ends with school.id. Without a total order, LIMIT/OFFSET
  // silently repeats and skips rows between pages.
  const orderBy = (() => {
    switch (criteria.sort) {
      case "selectivity":
        return [sql`${schoolAdmissions.acceptanceRate} asc nulls last`, asc(schools.id)];
      case "cost":
        return [sql`${schoolCosts.avgNetPrice} asc nulls last`, asc(schools.id)];
      case "name":
        return [asc(schools.name), asc(schools.id)];
      default:
        // "fit" needs editorial columns the database can't weigh, so the
        // page is ordered by selectivity and re-sorted by fit in the caller,
        // which has the full School objects.
        return [sql`${schoolAdmissions.acceptanceRate} asc nulls last`, asc(schools.id)];
    }
  })();

  const base = db
    .select({ id: schools.id })
    .from(schools)
    .innerJoin(schoolAdmissions, eq(schoolAdmissions.schoolId, schools.id))
    .leftJoin(
      schoolCosts,
      and(eq(schoolCosts.schoolId, schools.id), eq(schoolCosts.year, CURRENT_CYCLE)),
    )
    .where(where);

  const [idRows, totalRows] = await Promise.all([
    base
      .orderBy(...orderBy)
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: count() })
      .from(schools)
      .innerJoin(schoolAdmissions, eq(schoolAdmissions.schoolId, schools.id))
      .leftJoin(
        schoolCosts,
        and(eq(schoolCosts.schoolId, schools.id), eq(schoolCosts.year, CURRENT_CYCLE)),
      )
      .where(where),
  ]);

  const total = totalRows[0]?.n ?? 0;
  const ids = idRows.map((r) => r.id);
  const records = await getSchoolsByIds(ids);
  // getSchoolsByIds doesn't preserve order; restore the page's ordering.
  const byId = new Map(records.map((s) => [s.id, s]));

  return {
    schools: ids.map((id) => byId.get(id)).filter((s): s is SchoolRecord => !!s),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Counselor picks.
 *
 * Gated on `underrated_for`, which only the hand-written entries carry —
 * the reason shown to the student *is* that column, so a school without one
 * has nothing to say.
 */
export async function getCounselorPickCandidates(limit = 12): Promise<SchoolRecord[]> {
  const rows = await db
    .select({ id: schools.id })
    .from(schools)
    .where(and(isNotNull(schools.underratedFor), gt(schools.undergradEnrollment, 0)))
    .orderBy(asc(schools.id))
    .limit(limit);
  return getSchoolsByIds(rows.map((r) => r.id));
}

/** Every school id, for validating ids the model produced. */
export async function allSchoolIds(): Promise<Set<string>> {
  const rows = await db.select({ id: schools.id }).from(schools);
  return new Set(rows.map((r) => r.id));
}

/** Rough size of the reference set, for empty-state copy. */
export async function schoolCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schools);
  return row?.n ?? 0;
}
