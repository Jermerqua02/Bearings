/* ————————————————————————————————————————
   The real counselor — Claude behind the CounselorService interface.

   lib/counselor.ts is designed as the single AI boundary: implement the
   interface, swap the export, nothing else changes. This is that
   implementation.

   Server-only. The client never calls it directly and never supplies the
   profile — server actions read the profile from the session, so a forged
   payload can't request another student's scope.
   ———————————————————————————————————————— */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  CounselorCard,
  CounselorMessage,
  CounselorRequest,
  CounselorResponse,
  CounselorService,
  EssayFeedback,
  InterviewFeedback,
} from "@/lib/counselor";
import type { Profile, School, StudentProfile, Throughline } from "@/lib/types";
import { chatSystemPrompt, RENDER_CARDS_TOOL, schoolContextNote } from "./prompt";
import { enforceNeverWrites } from "./guardrails";
import { recordUsage, type AiFeature, type UsageCounts } from "./usage";

const MODEL = "claude-opus-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local — see .env.example.",
      );
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function messageId() {
  return crypto.randomUUID();
}

function textOf(blocks: Anthropic.ContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function cardsOf(blocks: Anthropic.ContentBlock[]): CounselorCard[] {
  const cards: CounselorCard[] = [];
  for (const b of blocks) {
    if (b.type === "tool_use" && b.name === "render_cards") {
      const input = b.input as { cards?: CounselorCard[] };
      if (Array.isArray(input?.cards)) cards.push(...input.cards);
    }
  }
  return cards;
}

/**
 * Drop cards referencing school ids that don't exist. The counselor page
 * resolves ids with getSchool() and renders nothing when it misses, so a
 * hallucinated id would show up as a silent blank.
 */
function pruneUnknownSchools(cards: CounselorCard[], known: Set<string>): CounselorCard[] {
  return cards
    .filter((c) => (c.kind === "school" ? known.has(c.schoolId) : true))
    .map((c) => {
      if (c.kind === "comparison") {
        return { ...c, schoolIds: c.schoolIds.filter((id) => known.has(id)) };
      }
      if (c.kind === "timeline") {
        return {
          ...c,
          items: c.items.map((i) =>
            i.schoolId && !known.has(i.schoolId) ? { ...i, schoolId: undefined } : i,
          ),
        };
      }
      return c;
    })
    .filter((c) => (c.kind === "comparison" ? c.schoolIds.length > 1 : true));
}

async function ask(
  system: string,
  messages: Anthropic.MessageParam[],
  opts: { tools?: Anthropic.Tool[]; maxTokens?: number; effort?: "low" | "medium" | "high" } = {},
) {
  return anthropic().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium" },
    ...(opts.tools ? { tools: opts.tools } : {}),
    messages,
  });
}

/**
 * Structured output is requested via output_config.format, but the model can
 * still wrap the object in a sentence. Extract the outermost JSON object
 * rather than assuming the whole text block is valid JSON — a live run
 * returned prose and took the parse down.
 */
function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error(`No JSON object in model response: ${text.slice(0, 120)}…`);
    }
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
}

/**
 * JSON-shaped asks, sent over raw HTTP rather than through the SDK.
 *
 * @anthropic-ai/sdk 0.115.0 accepts `output_config.format` in its types but
 * does not transmit it: the identical payload returns constrained JSON via
 * curl and prose via `messages.create()` — and `messages.parse()` fails the
 * same way, which is how this was isolated. Until the SDK is fixed, the
 * structured calls go direct so the schema is actually enforced rather than
 * silently ignored.
 *
 * Everything non-JSON still goes through the SDK.
 */
async function askJson<T>(
  system: string,
  userText: string,
  schema: Record<string, unknown>,
  maxTokens = 1024,
): Promise<{ data: T; usage: UsageCounts }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    content: Anthropic.ContentBlock[];
    usage: UsageCounts;
    stop_reason: string;
  };
  const text = textOf(json.content);
  if (!text) {
    throw new Error(
      `Empty response (stop_reason: ${json.stop_reason}). max_tokens covers thinking as well as text — raise it.`,
    );
  }
  return { data: parseJson<T>(text), usage: json.usage };
}

export function createClaudeCounselor(deps: {
  /** Valid school ids, for pruning hallucinated references. */
  knownSchoolIds: () => Promise<Set<string>>;
  /** Who to bill this call to. Every call is metered. */
  userId: string;
}): CounselorService {
  const meter = (feature: AiFeature, usage: UsageCounts | undefined) => {
    if (usage) void recordUsage(deps.userId, feature, usage);
  };

  return {
    async chat(req: CounselorRequest): Promise<CounselorResponse> {
      const contextNote = [
        req.context?.listSummary ?? "",
        req.context?.screen
          ? `The student opened this chat from the ${req.context.screen} screen.`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const history: Anthropic.MessageParam[] = req.history.slice(-20).map((m) => ({
        role: m.author === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));

      const res = await ask(
        chatSystemPrompt(req.profile, contextNote),
        [...history, { role: "user", content: req.message }],
        { tools: [RENDER_CARDS_TOOL], maxTokens: 2048 },
      );
      meter("chat", res.usage as UsageCounts);

      if (res.stop_reason === "refusal") {
        return {
          message: {
            id: messageId(),
            author: "counselor",
            text: "I can't help with that one. Ask me something about your list, your essays, or the process and I'll dig in.",
            createdAt: new Date().toISOString(),
          },
        };
      }

      const known = await deps.knownSchoolIds();
      const cards = pruneUnknownSchools(cardsOf(res.content), known);

      return {
        message: {
          id: messageId(),
          author: "counselor",
          text: textOf(res.content),
          cards: cards.length ? cards : undefined,
          createdAt: new Date().toISOString(),
        },
      };
    },

    async greet(profile: Profile): Promise<CounselorMessage> {
      const res = await ask(
        chatSystemPrompt(profile, ""),
        [
          {
            role: "user",
            content:
              "Open the conversation. Two or three sentences: greet them by name, name one specific thing you notice about where they are right now, and invite a question. No lists, no cards.",
          },
        ],
        { maxTokens: 900, effort: "low" },
      );
      meter("greet", res.usage as UsageCounts);
      return {
        id: messageId(),
        author: "counselor",
        text: textOf(res.content),
        createdAt: new Date().toISOString(),
      };
    },

    async summarizeProfile(profile: Profile): Promise<string> {
      const res = await ask(
        chatSystemPrompt(profile, ""),
        [
          {
            role: "user",
            content:
              "Reflect back what you're hearing about this person, in one short paragraph they'd recognize as accurate. Plain sentences. No score, no ranking, no advice yet.",
          },
        ],
        { maxTokens: 900, effort: "low" },
      );
      meter("summarize", res.usage as UsageCounts);
      return textOf(res.content);
    },

    async generateThroughline(profile: StudentProfile): Promise<Throughline> {
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["paragraph", "evidence", "stillForming"],
        properties: {
          paragraph: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          stillForming: { type: "boolean" },
        },
      };
      const { data, usage } = await askJson<Throughline>(
        chatSystemPrompt(profile, ""),
        `Find the thread connecting this student's coursework, activities, and interests into one coherent story — the thing an admissions reader would remember.

Write "paragraph" in second person, addressed to the student. Give 3–4 short "evidence" chips drawn from their actual profile. Set "stillForming" to true if they're in grade 9 or 10, or if the profile is too thin to claim a thread with confidence.

This is self-understanding, not positioning. Never compare them to other applicants.`,
        schema,
      );
      meter("throughline", usage);
      return data;
    },

    async whyThisSchool(profile: StudentProfile, school: School): Promise<string> {
      const res = await ask(
        chatSystemPrompt(profile, schoolContextNote(school)),
        [
          {
            role: "user",
            content: `In one or two sentences, why might ${school.name} fit this specific student? Be concrete — name something about their profile and something about the school. If it's a stretch financially or academically, say so plainly.`,
          },
        ],
        { maxTokens: 700, effort: "low" },
      );
      meter("why_school", res.usage as UsageCounts);
      return textOf(res.content);
    },

    async essayFeedback(
      profile: StudentProfile,
      promptText: string,
      essayText: string,
    ): Promise<EssayFeedback> {
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["observations", "questions"],
        properties: {
          observations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["area", "note"],
              properties: {
                area: { type: "string", enum: ["structure", "specificity", "voice"] },
                note: { type: "string" },
              },
            },
          },
          questions: { type: "array", items: { type: "string" } },
        },
      };

      const { data: raw, usage } = await askJson<EssayFeedback>(
        `${chatSystemPrompt(profile, "")}

You are reading a draft. You critique and you ask questions. You NEVER write
any part of the essay. Do not supply replacement sentences, suggested
openings, rewritten phrasings, or example prose — not even as illustration.
If you catch yourself about to write a line for them, ask a question that
would lead them to write it themselves.

Quoting a short phrase from their draft to point at it is fine. Handing back
polished prose is not.`,
        `Prompt: ${promptText || "(no prompt given)"}

Draft:
"""
${essayText || "(empty)"}
"""

Give observations on structure, specificity, and voice, and questions that would help them go deeper.`,
        schema,
        1500,
      );

      // The prompt asks; this enforces. A helpful model will still slip a
      // suggested line into a note.
      meter("essay_feedback", usage);
      const { feedback, violations } = enforceNeverWrites(raw, essayText);
      if (violations.length) {
        console.warn("[essay-guardrail]", violations.join("; "));
      }
      return feedback;
    },

    async interviewTurn(
      profile: StudentProfile,
      school: School | null,
      question: string,
      answer: string,
    ): Promise<InterviewFeedback> {
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["strengths", "toWorkOn", "followUp", "nextQuestion"],
        properties: {
          strengths: { type: "array", items: { type: "string" } },
          toWorkOn: { type: "array", items: { type: "string" } },
          followUp: { type: "string" },
          // Structured, so the UI stops regex-scraping it out of prose.
          nextQuestion: { type: "string" },
        },
      };

      const { data: turn, usage } = await askJson<InterviewFeedback & { nextQuestion: string }>(
        chatSystemPrompt(profile, schoolContextNote(school)),
        `Mock interview${school ? ` for ${school.name}` : ""}.

Question asked: ${question}
Their answer: """${answer}"""

Give 1–3 genuine strengths, 1–3 concrete things to work on, a short
conversational "followUp" reaction, and the single "nextQuestion" you'd ask
next. Put the next question in nextQuestion only — do not repeat it inside
followUp.`,
        schema,
        1200,
      );
      meter("interview", usage);
      return turn;
    },
  };
}
