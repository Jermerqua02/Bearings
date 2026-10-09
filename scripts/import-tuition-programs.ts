/* ————————————————————————————————————————
   Which schools take part in which regional tuition exchange — WUE, MSEP,
   the New England Regional Student Program, state reciprocity agreements —
   from lib/data/reciprocity.json into school_tuition_program.

     NODE_OPTIONS=--conditions=react-server tsx scripts/import-tuition-programs.ts [--dry]

   The program lists name institutions, not ids, so each is matched to a
   school by IPEDS id when the file gives one, otherwise by name within its
   state, the same normalization import-common-app.ts uses. Anything that
   doesn't match exactly one school is printed for review rather than
   guessed: a wrong match would tell a student they get a discount they
   don't.

   Replaces each program's rows wholesale, so a school that leaves a program
   stops showing it on the next run.
   ———————————————————————————————————————— */

import "./_env";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { schools, schoolTuitionPrograms } from "@/lib/db/schema";
import reciprocity from "@/lib/data/reciprocity.json";

interface Institution {
  name: string;
  state: string;
  ipedsId?: number | null;
  eligibleResidentStates?: string[] | null;
  restrictions?: string | null;
  url?: string | null;
}

interface Program {
  id: string;
  shortName: string;
  eligibleResidentStates: string[];
  institutions: Institution[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint")
    .replace(/\buniv\b/g, "university")
    .replace(/\b(the|of|at|and|a|in|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const dry = process.argv.includes("--dry");
  const programs = reciprocity.programs as unknown as Program[];

  const ours = await db
    .select({ id: schools.id, name: schools.name, state: schools.state, ipedsId: schools.ipedsId })
    .from(schools);
  const byIpeds = new Map(ours.filter((o) => o.ipedsId != null).map((o) => [o.ipedsId!, o]));
  const byNameState = new Map<string, typeof ours>();
  for (const o of ours) {
    const k = `${norm(o.name)}|${o.state}`;
    byNameState.set(k, [...(byNameState.get(k) ?? []), o]);
  }

  const review: string[] = [];
  for (const program of programs) {
    const rows: (typeof schoolTuitionPrograms.$inferInsert)[] = [];
    const seen = new Set<string>();
    for (const inst of program.institutions) {
      const hit = inst.ipedsId != null ? [byIpeds.get(inst.ipedsId)].filter(Boolean) : byNameState.get(`${norm(inst.name)}|${inst.state}`) ?? [];
      if (hit.length !== 1) {
        review.push(`${program.shortName}\t${inst.name}, ${inst.state}\t${hit.length === 0 ? "no match" : `${hit.length} matches`}`);
        continue;
      }
      const school = hit[0]!;
      if (seen.has(school.id)) continue;
      seen.add(school.id);
      rows.push({
        schoolId: school.id,
        program: program.id,
        // The school's own narrower list, where it has one.
        eligibleStates: (inst.eligibleResidentStates ?? program.eligibleResidentStates).filter(
          (st) => st !== school.state,
        ),
        restrictions: inst.restrictions ?? null,
        url: inst.url ?? null,
      });
    }
    console.log(`${program.shortName}: ${rows.length} of ${program.institutions.length} matched`);
    if (dry) continue;
    await db.transaction(async (tx) => {
      await tx.delete(schoolTuitionPrograms).where(eq(schoolTuitionPrograms.program, program.id));
      if (rows.length) await tx.insert(schoolTuitionPrograms).values(rows);
    });
  }

  // Programs no longer in the file.
  if (!dry) {
    const ids = programs.map((p) => p.id);
    const stale = (await db.selectDistinct({ program: schoolTuitionPrograms.program }).from(schoolTuitionPrograms))
      .map((r) => r.program)
      .filter((p) => !ids.includes(p));
    if (stale.length) await db.delete(schoolTuitionPrograms).where(inArray(schoolTuitionPrograms.program, stale));
  }

  if (review.length) {
    console.log(`\nFor review (${review.length}):`);
    for (const line of review) console.log(`  ${line}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
