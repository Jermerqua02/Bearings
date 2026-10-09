/* ————————————————————————————————————————
   What a student pays given where they live.

   College Scorecard's net prices at a public school are for in-state
   students. Shown as-is to a student from another state, they understate
   the cost by the whole out-of-state premium — SDSU's "$13k" is a
   Californian's number. So every estimate goes through here:

     in-state / private   the published net price
     out-of-state public  net price + (out-of-state − in-state tuition)
     regional exchange    the same, with tuition capped by the program's
                          rule — WUE's 150% of in-state, say

   It is an estimate and says so: out-of-state students often get less aid
   than the in-state students Scorecard averaged, and the exchanges award
   their discount at the school's discretion.

   The programs (names, terms, how to ask) come from lib/data/reciprocity.json;
   which schools take part comes from school_tuition_program, written by
   scripts/import-tuition-programs.ts.
   ———————————————————————————————————————— */

import "server-only";

import reciprocity from "@/lib/data/reciprocity.json";
import { US_STATES } from "@/lib/states";
import type { School, TuitionProgramRef } from "@/lib/types";

export { US_STATES, isUsState } from "@/lib/states";

type TuitionRule =
  | { kind: "inState" }
  | { kind: "percentOfInState"; percent: number }
  | { kind: "percentOffOutOfState"; percent: number }
  | { kind: "varies" };

export interface TuitionProgram {
  id: string;
  name: string;
  shortName: string;
  url: string;
  terms: string;
  howToGet: string;
  tuitionRule: TuitionRule;
}

export const TUITION_PROGRAMS: Map<string, TuitionProgram> = new Map(
  (reciprocity.programs as unknown as TuitionProgram[]).map((p) => [p.id, p]),
);

/*
  Exchanges that turn on the student's major (Tuition Break: majors their
  home state doesn't offer; the Academic Common Market: approved programs
  only) or their county (Indiana's border agreements). Knowing only their
  state, we can't say they qualify — so these are mentioned as worth asking
  about, and never taken off the estimate.
*/
const CONDITIONAL = new Set(["nebhe-tuition-break", "acm", "in-oh-border", "in-ky-border"]);

export interface Residency {
  /**
   * unknown        we don't know where they live
   * in-state       public school in their state
   * out-of-state   public school elsewhere, no exchange
   * exchange       public school elsewhere, a regional exchange applies
   * private        residency doesn't change the price
   */
  status: "unknown" | "in-state" | "out-of-state" | "exchange" | "private";
  /** What residency adds to the in-state net price, per year. */
  extraPerYear?: number;
  /** Without the exchange — what they'd pay as a regular out-of-state student. */
  outOfStateExtraPerYear?: number;
  program?: TuitionProgram & { restrictions?: string; schoolUrl?: string };
  /** Out of state, with an exchange that depends on major or county. */
  maybe?: (TuitionProgram & { restrictions?: string; schoolUrl?: string })[];
}

/** Where `homeState` leaves a student at `school`. */
export function residencyAt(school: School, homeState: string | undefined): Residency {
  const { tuitionInState: inState, tuitionOutOfState: outState } = school.cost;
  // Public is a tuition fact more than a label: HBCUs and tech schools come
  // in both kinds. A school that charges everyone the same is "private" here.
  const premium = inState != null && outState != null ? Math.max(0, outState - inState) : undefined;
  const isPublic = premium != null ? premium > 0 : school.type === "public" || school.type === "public-flagship";
  if (!isPublic) return { status: "private" };
  if (!homeState) return { status: "unknown" };
  if (school.state === homeState) return { status: "in-state" };

  const refs = (school.cost.tuitionPrograms ?? []).filter((r) => r.eligibleStates.includes(homeState));
  const maybe = refs
    .filter((r) => CONDITIONAL.has(r.program) && TUITION_PROGRAMS.has(r.program))
    .map((r) => ({ ...TUITION_PROGRAMS.get(r.program)!, restrictions: r.restrictions, schoolUrl: r.url }));
  const best = bestProgram(refs.filter((r) => !CONDITIONAL.has(r.program)), homeState, inState, outState);
  // An exchange capped at the full premium saves nothing here (out-of-state
  // tuition is already under 150% of in-state): don't call it one.
  const saves = best && !(best.extra != null && premium != null && best.extra >= premium);
  if (best && saves) {
    return {
      status: "exchange",
      extraPerYear: best.extra,
      outOfStateExtraPerYear: premium,
      program: { ...best.program, restrictions: best.ref.restrictions, schoolUrl: best.ref.url },
      maybe: maybe.length ? maybe : undefined,
    };
  }
  return { status: "out-of-state", extraPerYear: premium, maybe: maybe.length ? maybe : undefined };
}

/** The exchange that saves this student the most here, if any applies. */
function bestProgram(
  refs: TuitionProgramRef[],
  homeState: string,
  inState: number | undefined,
  outState: number | undefined,
) {
  let best: { ref: TuitionProgramRef; program: TuitionProgram; extra?: number } | undefined;
  for (const ref of refs) {
    if (!ref.eligibleStates.includes(homeState)) continue;
    const program = TUITION_PROGRAMS.get(ref.program);
    if (!program) continue;
    const extra = exchangeExtra(program.tuitionRule, inState, outState);
    if (!best || (extra ?? Infinity) < (best.extra ?? Infinity)) best = { ref, program, extra };
  }
  return best;
}

/** What the exchange tuition adds over in-state tuition. Undefined if we can't tell. */
function exchangeExtra(rule: TuitionRule, inState?: number, outState?: number): number | undefined {
  if (rule.kind === "inState") return 0;
  if (inState == null) return undefined;
  const cap = outState != null ? Math.max(0, outState - inState) : Infinity;
  if (rule.kind === "percentOfInState") return Math.min(cap, Math.round((inState * (rule.percent - 100)) / 100));
  if (rule.kind === "percentOffOutOfState" && outState != null) {
    return Math.min(cap, Math.max(0, Math.round(outState * (1 - rule.percent / 100)) - inState));
  }
  return undefined;
}

/** A net price adjusted for where the student lives. */
export function adjustForResidency(netPrice: number | undefined, residency: Residency): number | undefined {
  if (netPrice == null) return undefined;
  return netPrice + (residency.extraPerYear ?? 0);
}

function maybeNote(r: Residency): string {
  if (!r.maybe?.length) return r.status === "out-of-state" ? " No regional exchange we know of applies." : "";
  return ` It may also be cheaper through ${r.maybe.map((p) => `${p.name} (${p.terms}${p.restrictions ? ` ${p.restrictions}` : ""})`).join("; ")} — that depends on their major or county, so don't assume it; tell them it's worth checking.`;
}

/** One line for the counselor's prompt, about one school. */
export function residencyNote(school: School, residency: Residency, homeState?: string): string {
  const home = homeState ? US_STATES[homeState] ?? homeState : undefined;
  const $ = (n: number) => `$${n.toLocaleString("en-US")}`;
  switch (residency.status) {
    case "private":
      return school.type === "public" || school.type === "public-flagship"
        ? `${school.shortName} is public but charges the same tuition wherever the student lives.`
        : `${school.shortName} is private: tuition is the same wherever the student lives.`;
    case "unknown":
      return `${school.shortName} is public, and we don't know the student's home state — its net prices are for in-state students.`;
    case "in-state":
      return `${school.shortName} is a public school in the student's home state (${home}): in-state tuition applies.`;
    case "out-of-state":
      return `${school.shortName} is public and out of state for the student (they live in ${home}). Its published net prices are for in-state students; out-of-state tuition adds about ${residency.extraPerYear != null ? $(residency.extraPerYear) : "an unknown amount"} a year.${maybeNote(residency)}`;
    case "exchange": {
      const p = residency.program!;
      return `${school.shortName} is public and out of state for the student (they live in ${home}), but it takes part in ${p.name} (${p.shortName}) for ${home} residents: ${p.terms}${residency.extraPerYear != null ? ` That's about ${$(residency.extraPerYear)} a year over in-state, versus ${residency.outOfStateExtraPerYear != null ? $(residency.outOfStateExtraPerYear) : "the full out-of-state premium"} without it.` : ""} ${p.howToGet}${p.restrictions ? ` At ${school.shortName}: ${p.restrictions}` : ""}${maybeNote(residency)}`;
    }
  }
}
