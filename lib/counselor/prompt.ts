/* ————————————————————————————————————————
   The counselor's system prompt and tool schema.

   Kept separate from the service so the product rules live in one readable
   place. These aren't decoration — the README lists them as rules the
   product enforces, and several are the difference between this and a
   generic chatbot.
   ———————————————————————————————————————— */

import { MEMORY_CATEGORIES } from "@/lib/memory";
import type Anthropic from "@anthropic-ai/sdk";
import type { Profile, School, StudentProfile } from "@/lib/types";
import { residencyAt, residencyNote, US_STATES } from "@/lib/residency";

/** Product rules, stated once, shared by every call. */
const HOUSE_RULES = `
You are Lumni, an honest college counselor for high school students and
their families — for the ~95% who cannot hire a private counselor.

Non-negotiable rules:
- Never hype, never doom. "This is a reach, and that's fine — here's how to
  build around it" is the register.
- Never score a student out of 100, and never rank them against other
  applicants. Chance tiers are categories (reach / target / likely), not
  numbers. Self-understanding, not competitive positioning.
- Net price, not sticker price, is the default number you discuss.
- Where the student lives decides what public colleges cost them. Published
  net prices at a public school are for in-state students; the residency
  notes you're given say what applies to this student — in-state,
  out-of-state, or a regional exchange like WUE — so use them, and never
  hedge with "if you're a resident of…" when you know. When their home state
  is unknown and cost matters to the answer, ask where they live.
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
    `- Lives in: ${p.homeState ? `${US_STATES[p.homeState] ?? p.homeState} (${p.homeState})` : "not shared yet"}`,
    p.geography.regions.length ? `- Regions: ${p.geography.regions.join(", ")}` : "",
    p.values.length ? `- Priorities: ${p.values.join(", ")}` : "",
    notesSection(p),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What they've told you before, by topic. This is what lets the counselor
 * pick up where the student left off in a different conversation — and the
 * student can see and correct every line of it on their You screen.
 */
function notesSection(p: StudentProfile): string {
  const notes = p.counselorNotes ?? [];
  if (!notes.length) return "";
  const byTopic = MEMORY_CATEGORIES.map((c) => {
    const lines = notes.filter((n) => n.category === c.id).map((n) => `  - ${n.fact}`);
    return lines.length ? `- ${c.label}:\n${lines.join("\n")}` : "";
  }).filter(Boolean);
  return byTopic.length
    ? `\nWhat they've told you in earlier conversations (their own words, as remembered — trust it, and don't ask again for what's here):\n${byTopic.join("\n")}`
    : "";
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

/**
 * For a conversation the student started from a school's page ("Ask the
 * counselor"). Stronger than schoolContextNote: the whole conversation is
 * about this school, so "here", "it" and "my chances" mean it. Carries the
 * figures the school page shows, so the answer and the page agree.
 */
export function conversationSchoolNote(school: School, homeState?: string): string {
  const $ = (n?: number) => (n == null ? null : `$${n.toLocaleString("en-US")}`);
  const pct = (n?: number) => (n == null ? null : `${Math.round(n * 100)}%`);
  const byIncome = school.cost.netPriceByIncome;
  const facts = [
    `${school.type}, ${school.undergradEnrollment.toLocaleString("en-US")} undergraduates`,
    pct(school.admissions.acceptanceRate) && `admits ${pct(school.admissions.acceptanceRate)}`,
    `testing ${school.admissions.testPolicy}`,
    $(school.cost.avgNetPrice) && `average net price ${$(school.cost.avgNetPrice)}/yr`,
    $(school.cost.stickerPrice) && `sticker price ${$(school.cost.stickerPrice)}/yr`,
    (byIncome.under48k ?? byIncome.over110k) != null &&
      `net price by family income: under $48k ${$(byIncome.under48k) ?? "n/a"}, $48–75k ${$(byIncome.k48to75) ?? "n/a"}, $75–110k ${$(byIncome.k75to110) ?? "n/a"}, over $110k ${$(byIncome.over110k) ?? "n/a"}`,
    pct(school.outcomes.gradRate) && `graduation rate ${pct(school.outcomes.gradRate)} within six years`,
    $(school.outcomes.medianEarnings10yr) && `median earnings ${$(school.outcomes.medianEarnings10yr)}`,
    ...Object.entries(school.admissions.deadlines).map(([plan, date]) => `${plan} deadline ${date}`),
  ].filter(Boolean);
  return `This conversation is about ${school.name} (id: ${school.id}) in ${school.city}, ${school.state} — the student started it from that school's page. Unless they clearly mean somewhere else, "this school", "here", "it" and questions about chances, cost or fit refer to ${school.name}. What the school page shows them: ${facts.join("; ")}. ${residencyNote(school, residencyAt(school, homeState), homeState)}`;
}

export function schoolContextNote(school: School | null, homeState?: string): string {
  if (!school) return "";
  return `The student is currently looking at ${school.name} (id: ${school.id}) in ${school.city}, ${school.state}. ${residencyNote(school, residencyAt(school, homeState), homeState)}`;
}
