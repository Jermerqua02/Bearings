/* ————————————————————————————————————————
   The counselor's system prompt and tool schema.

   Kept separate from the service so the product rules live in one readable
   place. These aren't decoration — the README lists them as rules the
   product enforces, and several are the difference between this and a
   generic chatbot.
   ———————————————————————————————————————— */

import type Anthropic from "@anthropic-ai/sdk";
import type { Profile, School, StudentProfile } from "@/lib/types";

/** Product rules, stated once, shared by every call. */
const HOUSE_RULES = `
You are Northstar, an honest college counselor for high school students and
their families — for the ~95% who cannot hire a private counselor.

Non-negotiable rules:
- Never hype, never doom. "This is a reach, and that's fine — here's how to
  build around it" is the register.
- Never score a student out of 100, and never rank them against other
  applicants. Chance tiers are categories (reach / target / likely), not
  numbers. Self-understanding, not competitive positioning.
- Net price, not sticker price, is the default number you discuss.
- No outcome guarantees, no fabricated statistics, no invented deadlines. If
  you don't know a figure, say so rather than estimating one.
- Undecided about a major is a legitimate, complete answer. Treat it as an
  honest starting point, never a deficiency to correct.
- Do not manufacture urgency. Deadlines are facts; pressure is not.

Voice: direct, warm, specific. Short paragraphs. You are talking to a
teenager who is capable of hearing the truth, or to a parent who last saw
this process decades ago and needs it explained plainly.
`.trim();

export function chatSystemPrompt(profile: Profile, contextNote: string): string {
  const who =
    profile.role === "student"
      ? studentSummary(profile as StudentProfile)
      : parentSummary(profile);

  return `${HOUSE_RULES}

Who you are talking to:
${who}

${contextNote}

When a structured answer would land better than prose, emit a card with the
render_cards tool — a tier breakdown, a checklist, a deadline timeline, or a
side-by-side comparison. Reference schools by their id from the student's
list or the ids given to you; never invent an id.

Keep responses to the length the question needs. Lead with the answer.`;
}

function studentSummary(p: StudentProfile): string {
  const gpa = p.gpa.unweighted ? `${p.gpa.unweighted} unweighted` : "GPA not shared";
  const test = p.testScores.sat
    ? `SAT ${p.testScores.sat}`
    : p.testScores.act
      ? `ACT ${p.testScores.act}`
      : p.testScores.planningToTest
        ? "planning to test, no score yet"
        : "not testing";
  const majors = p.undecided || p.intendedMajors.length === 0
    ? "undecided (a legitimate answer — treat it as one)"
    : p.intendedMajors.join(", ");
  const budget = p.budget.maxPerYear
    ? `up to $${p.budget.maxPerYear.toLocaleString()}/year net${p.budget.willFileFafsa ? ", filing FAFSA" : ""}`
    : "budget not shared";

  return [
    `- ${p.firstName}, grade ${p.gradeLevel}`,
    `- ${gpa}; ${p.rigor.apCount} AP, ${p.rigor.ibCount} IB, ${p.rigor.honorsCount} honors`,
    `- ${test}`,
    `- Interested in: ${majors}`,
    `- Budget: ${budget}`,
    p.geography.regions.length ? `- Regions: ${p.geography.regions.join(", ")}` : "",
    p.values.length ? `- Priorities: ${p.values.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parentSummary(p: Extract<Profile, { role: "parent" }>): string {
  return [
    `- ${p.firstName}, ${p.relationship} of a grade-${p.studentGrade} student`,
    p.budgetPerYear ? `- Budget: up to $${p.budgetPerYear.toLocaleString()}/year` : "",
    p.biggestWorry ? `- Biggest worry: ${p.biggestWorry}` : "",
    `- Wants ${p.involvementLevel.replace(/-/g, " ")} involvement`,
    "",
    "You are speaking to a PARENT. Never reveal the student's private",
    "counselor conversations or essay drafts. If asked for them, say plainly",
    "that those stay between the student and their counselor.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ————————————— Tools ————————————— */

/**
 * The CounselorCard union from lib/counselor.ts, expressed as a tool. All
 * five kinds are already typed and rendered by the counselor page; the mock
 * only ever emitted two, so checklist / timeline / comparison have been dead
 * code until now.
 */
export const RENDER_CARDS_TOOL: Anthropic.Tool = {
  name: "render_cards",
  description:
    "Attach one or more structured cards to your reply. Use when a list, a comparison, a set of deadlines, or a breakdown reads better than a paragraph. Emit cards alongside your text, not instead of it.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        items: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "schoolId", "reason"],
              properties: {
                kind: { type: "string", enum: ["school"] },
                schoolId: { type: "string", description: "A school id such as 'umich'." },
                reason: {
                  type: "string",
                  description: "One sentence on why this school, for this student.",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "tiers"],
              properties: {
                kind: { type: "string", enum: ["tier-breakdown"] },
                tiers: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["tier", "count"],
                    properties: {
                      tier: { type: "string", enum: ["reach", "target", "likely"] },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "title", "items"],
              properties: {
                kind: { type: "string", enum: ["checklist"] },
                title: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["text", "done"],
                    properties: { text: { type: "string" }, done: { type: "boolean" } },
                  },
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "schoolIds", "rows"],
              properties: {
                kind: { type: "string", enum: ["comparison"] },
                schoolIds: { type: "array", items: { type: "string" } },
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["label", "values"],
                    properties: {
                      label: { type: "string" },
                      values: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "items"],
              properties: {
                kind: { type: "string", enum: ["timeline"] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["date", "label"],
                    properties: {
                      date: { type: "string", description: "ISO date, e.g. 2026-11-01" },
                      label: { type: "string" },
                      schoolId: { type: "string" },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
};

export function schoolContextNote(school: School | null): string {
  if (!school) return "";
  return `The student is currently looking at ${school.name} (id: ${school.id}) in ${school.city}, ${school.state}.`;
}
