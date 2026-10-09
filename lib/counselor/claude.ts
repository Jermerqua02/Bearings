/* ————————————————————————————————————————
   The real counselor — Claude behind the CounselorService interface.

   lib/counselor.ts is designed as the single AI boundary: implement the
   interface, swap the export, nothing else changes. This is that
   implementation.

   Server-only. The client never calls it directly and never supplies the
   profile — server actions read the profile from the session, so a forged
   payload can't request another student's scope.
   ———————————————————————————————————————— */

import { MEMORY_CATEGORIES, isMemoryCategory } from "@/lib/memory";
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatEvents,
  CounselorCard,
  CounselorMessage,
  CounselorRequest,
  CounselorResponse,
  CounselorService,
  EssayFeedback,
  InterviewExchange,
  InterviewFeedback,
  TranscriptReading,
} from "@/lib/counselor";
import { localTitle } from "@/lib/counselor";
import type {
  CoursePlanEntry,
  ExtractedCourse,
  Profile,
  School,
  StudentProfile,
  Throughline,
} from "@/lib/types";
import { chatSystemPrompt, conversationSchoolNote, RENDER_CARDS_TOOL, schoolContextNote } from "./prompt";
import { enforceNeverWrites } from "./guardrails";
import { UserFacingError } from "@/lib/actions/_error";
import { recordUsage, type AiFeature, type UsageCounts } from "./usage";

const MODEL = "claude-opus-5";
/** Interview feedback: a spoken back-and-forth, where every second of waiting shows. */
const INTERVIEW_SPEED = { model: "claude-sonnet-5-5", effort: "low" } as const;

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
 * ask(), streamed — for the chat, where the student is watching. Reports
 * what the model is doing as it does it (thinking, writing, building cards)
 * and hands over the answer's text as it's written, then resolves to the
 * same final message ask() would have returned.
 */
async function askStreamed(
  system: string,
  messages: Anthropic.MessageParam[],
  opts: { tools?: Anthropic.Tool[]; maxTokens?: number; effort?: "low" | "medium" | "high" },
  events: ChatEvents = {},
) {
  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium" },
    ...(opts.tools ? { tools: opts.tools } : {}),
    messages,
  });
  let textBlocks = 0;
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const kind = event.content_block.type;
      if (kind === "thinking" || kind === "redacted_thinking") events.onPhase?.("thinking");
      else if (kind === "tool_use") events.onPhase?.("cards");
      else if (kind === "text") {
        events.onPhase?.("writing");
        // textOf() joins separate text blocks with a newline; match it.
        if (textBlocks++ > 0) events.onText?.("\n");
      }
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      events.onText?.(event.delta.text);
    }
  }
  return stream.finalMessage();
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
  /**
   * The user turn. A plain string for text-only asks; an array of content
   * blocks when the ask carries a document or an image.
   */
  userContent: string | Anthropic.ContentBlockParam[],
  schema: Record<string, unknown>,
  maxTokens = 1024,
  /** For a route where waiting matters more than depth. Defaults to MODEL at medium effort. */
  speed?: { model: string; effort: "low" | "medium" | "high" },
): Promise<{ data: T; usage: UsageCounts }> {
  // The SDK path checks this in anthropic(); the raw-HTTP path used to send
  // `x-api-key: undefined` and surface a 401 instead of the missing key.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local — see .env.example.",
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // A declined request is re-run on a fallback model inside the same
      // call, rather than coming back empty mid-interview.
      ...(speed ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
    },
    body: JSON.stringify({
      model: speed?.model ?? MODEL,
      max_tokens: maxTokens,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: speed?.effort ?? "medium", format: { type: "json_schema", schema } },
      ...(speed ? { fallbacks: "default" } : {}),
      messages: [{ role: "user", content: userContent }],
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
  if (json.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = textOf(json.content);
  if (!text) {
    throw new Error(
      `Empty response (stop_reason: ${json.stop_reason}). max_tokens covers thinking as well as text — raise it.`,
    );
  }
  return { data: parseJson<T>(text), usage: json.usage };
}

/**
 * The same ask, streamed.
 *
 * Needed once an answer can get long. A real four-year transcript is fifty
 * courses, and the first version of this asked for all of them inside an
 * 8,000-token budget that thinking also draws on. The JSON came back cut off
 * mid-array — which surfaced as a JSON parse error, the least informative
 * possible symptom of "the budget was too small".
 *
 * Streaming is what makes a large budget usable: a non-streaming request
 * holding one HTTP connection open for a 32,000-token answer runs into
 * client and proxy timeouts long before the model is done.
 */
async function askJsonStreamed<T>(
  system: string,
  userContent: string | Anthropic.ContentBlockParam[],
  schema: Record<string, unknown>,
  maxTokens: number,
): Promise<{ data: T; usage: UsageCounts; truncated: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local — see .env.example.",
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      stream: true,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  let text = "";
  let stopReason = "";
  const usage: UsageCounts = {};

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line, and a chunk boundary can
    // land mid-frame — so only complete frames are consumed each pass.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;

      let event: {
        type: string;
        delta?: { type?: string; text?: string; stop_reason?: string };
        message?: { usage?: UsageCounts };
        usage?: UsageCounts;
      };
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        text += event.delta.text ?? "";
      } else if (event.type === "message_start") {
        Object.assign(usage, event.message?.usage ?? {});
      } else if (event.type === "message_delta") {
        // Carries the final output_tokens and the stop reason.
        Object.assign(usage, event.usage ?? {});
        stopReason = event.delta?.stop_reason ?? stopReason;
      } else if (event.type === "error") {
        throw new Error(`Anthropic stream error: ${line.slice(5, 205)}`);
      }
    }
  }

  /*
    Truncation is reported rather than parsed. Half a JSON array is not a
    smaller answer, it is a broken one, and the caller needs to be able to
    tell the student "your transcript was longer than one pass" instead of
    showing them a parse error.
  */
  if (stopReason === "max_tokens") {
    return { data: undefined as T, usage, truncated: true };
  }
  if (!text.trim()) {
    throw new Error(`Empty response (stop_reason: ${stopReason || "unknown"}).`);
  }

  return { data: parseJson<T>(text), usage, truncated: false };
}

/* ————————————— Transcript reading ————————————— */

/** Must match CoursePlanEntry["subject"] — the DB enum rejects anything else. */
const SUBJECTS: CoursePlanEntry["subject"][] = [
  "English",
  "Math",
  "Science",
  "Social Studies",
  "Language",
  "Arts",
  "Elective",
];

/** Formats Claude can read directly. Anything else is refused at upload. */
export const TRANSCRIPT_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/**
 * A PDF goes in a `document` block and a photo in an `image` block. Sending
 * one as the other is a 400, and a student photographing their transcript
 * with a phone is at least as likely as exporting a PDF.
 */
function documentBlockFor(file: {
  bytes: Buffer;
  contentType: string;
}): Anthropic.ContentBlockParam {
  const data = file.bytes.toString("base64");
  if (file.contentType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: file.contentType as "image/png" | "image/jpeg" | "image/webp",
      data,
    },
  };
}

/*
  The one instruction that matters here is the last one: transcribe, don't
  infer. Everything else on this page is data the student typed themselves;
  this is the one place where a model writes into their academic record, and
  a plausible invented course is far worse than a missing one — they will
  scan the list, see nothing obviously wrong, and accept it.
*/
const TRANSCRIPT_SYSTEM = `You read high school transcripts and transcribe the coursework they list.

For every course on the document, report:
- year: the grade level the course was taken in (9, 10, 11 or 12). Transcripts
  label this in different ways — "Grade 10", "Sophomore", "2023-2024" next to a
  class year, a section header. Work it out from the document. If a course
  cannot be tied to a grade level, leave it out and say so in notes.
- subject: exactly one of English, Math, Science, Social Studies, Language,
  Arts, Elective. "Language" means world/foreign language. Anything that fits
  none of the others is Elective.
- name: the course title as printed, cleaned of catalog codes.
- level: "ap" for Advanced Placement, "ib" for International Baccalaureate,
  "honors" for honors/advanced/accelerated, otherwise "regular".
- grade: the letter grade as printed (A, B+, C-). If the transcript shows a
  number, convert on the standard scale and say in notes that you did. Null
  for a course in progress or with no grade shown.
- term and credits: as printed, or null. Term matters — transcripts are
  organised by grading period, so a year-long course appears once per
  semester or quarter with a different grade each time. Those are separate
  rows, not duplicates: report each one, and put the period in "term"
  ("S1", "06/2022", "Quarter 3") so the student can tell them apart.
- credits: the credit value earned for that row, as printed (0.5, 1.0,
  0.875). GPA is credit-weighted, so this is not decoration.

Report the cumulative GPA the transcript prints for itself in reportedGpa —
unweighted, weighted, and the total credits it was computed over. Read these
figures off the document; never compute them yourself, and never estimate.
Transcripts label them variously: "Cum:", "Cumulative G.P.A.", "Weighted
GPA", or an unlabelled figure at the foot of a totals row. If the document
prints no GPA, all three are null.

Courses taken before grade 9 — high school credit earned in middle school,
which transcripts do list — must NOT be assigned a grade level of 9. Leave
them out of courses and say in notes which ones they were and what grade
level they were taken in.

Set looksLikeTranscript to false if the document is not an academic transcript,
and return no courses.

Use notes for anything the student should check: an illegible section, a
grading scale you converted, a page that appears to be from another school, a
course you skipped and why. Write them as short plain sentences to the student.

Transcribe only what the document shows. Never infer, complete, or tidy a
course list — if you cannot read something, say so in notes rather than
supplying a likely value. A missing course is a small problem; an invented one
is a serious one, because it ends up in their record looking confirmed.`;

export function createClaudeCounselor(deps: {
  /** Valid school ids, for pruning hallucinated references. */
  knownSchoolIds: () => Promise<Set<string>>;
  /** Who to bill this call to. Every call is metered. */
  userId: string;
}): CounselorService {
  const meter = (feature: AiFeature, usage: UsageCounts | undefined, model?: string) => {
    if (usage) void recordUsage(deps.userId, feature, usage, model);
  };

  return {
    async chat(req: CounselorRequest, events?: ChatEvents): Promise<CounselorResponse> {
      const contextNote = [
        req.context?.school
          ? conversationSchoolNote(
              req.context.school,
              req.profile.role === "student" ? req.profile.homeState : undefined,
            )
          : "",
        req.context?.listSummary ?? "",
        req.context?.courseworkSummary ?? "",
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

      const res = await askStreamed(
        chatSystemPrompt(req.profile, contextNote),
        [...history, { role: "user", content: req.message }],
        { tools: [RENDER_CARDS_TOOL], maxTokens: 2048 },
        events,
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
        chatSystemPrompt(profile, schoolContextNote(school, profile.homeState)),
        [
          {
            role: "user",
            // Shown under "How it fits you". It used to be asked "why might
            // this fit", and for a poor fit came back "Honestly? It mostly
            // doesn't" under a heading that promised the opposite. Now the
            // verdict leads, whichever way it goes.
            content: `How well does ${school.name} fit this specific student? Open with a plain verdict of a few words ("A strong fit." / "A good fit with one catch." / "Honestly, a stretch."), then two or three sentences on why — something concrete about their profile and something about the school, including cost at their price and their real chances if either is the catch. One short paragraph, no lists.`,
          },
        ],
        { maxTokens: 700, effort: "low" },
      );
      meter("why_school", res.usage as UsageCounts);
      return textOf(res.content);
    },

    async extractMemories({ studentMessage, counselorReply, known }) {
      /*
        Haiku again, for the same reasons as titles: it runs after every
        reply, off the student's critical path, and it's filing, not counsel.

        The bar for keeping something is "would a good counselor write this
        in their notes" — a fact about the student that will still be true
        and still matter next month. Questions, the counselor's own advice,
        and small talk are not facts about the student.
      */
      const categories = MEMORY_CATEGORIES.map((c) => `- ${c.id}: ${c.description}`).join("\n");
      const knownList = known.length
        ? known.map((k) => `[${k.id}] (${k.category}) ${k.fact}`).join("\n")
        : "(nothing yet)";
      try {
        const res = await anthropic().messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: [
            {
              type: "text",
              text:
                "You keep a college counselor's notes on one high school student. From one exchange, record only durable facts the STUDENT revealed about themselves: grades, scores, classes, activities, roles, awards, jobs, interests, intended majors, career ideas, what they want in a college, schools they love or have ruled out, money and family circumstances, constraints, background, values.\n\n" +
                "Do not record: questions they asked, the counselor's advice or opinions, plans the counselor suggested that the student didn't adopt, small talk, or anything already in the known notes unless the student has now changed it.\n\n" +
                "Write each fact as a short third-person note without the student's name, specific and self-contained: \"Plays varsity soccer; team captain junior year\", \"Wants to stay within a day's drive of home\", \"Family can contribute about $15k a year\".\n\n" +
                "Categories:\n" + categories + "\n\n" +
                'Reply with JSON only: {"add":[{"category":"<id>","fact":"<note>"}],"update":[{"id":"<known id>","fact":"<corrected note>"}]}. Use update when the student corrects or changes a known note. Most exchanges reveal nothing new — then reply {"add":[],"update":[]}.',
            },
          ],
          messages: [
            {
              role: "user",
              content: `Known notes:\n${knownList}\n\nStudent said:\n${studentMessage.slice(0, 3000)}\n\nCounselor replied:\n${counselorReply.slice(0, 1500)}`,
            },
          ],
        });
        meter("memory", res.usage as UsageCounts, "claude-haiku-4-5-20251001");
        const raw = textOf(res.content).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
        const parsed = JSON.parse(raw) as { add?: unknown; update?: unknown };
        const knownIds = new Set(known.map((k) => k.id));
        const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 280) : "");
        return {
          add: (Array.isArray(parsed.add) ? parsed.add : [])
            .map((a) => ({ category: String(a?.category ?? ""), fact: clean(a?.fact) }))
            .filter((a) => isMemoryCategory(a.category) && a.fact.length > 3)
            .slice(0, 8),
          update: (Array.isArray(parsed.update) ? parsed.update : [])
            .map((u) => ({ id: String(u?.id ?? ""), fact: clean(u?.fact) }))
            .filter((u) => knownIds.has(u.id) && u.fact.length > 3)
            .slice(0, 8),
        };
      } catch (err) {
        // Memory is a nicety on top of the reply; a bad parse just means
        // this turn taught us nothing.
        console.error("[memory] extraction failed:", err);
        return { add: [], update: [] };
      }
    },

    async titleFor(firstMessage: string, reply: string): Promise<string> {
      /*
        Haiku, not the counselor's model, and deliberately.

        A title is a labelling job, not counsel, and it sits between the
        student pressing send and seeing their history update — so it should
        be fast and cheap. It also sidesteps a trap that has already cost
        time here: Opus with adaptive thinking and a small token budget
        spends the budget thinking and returns empty text rather than an
        error, which would silently leave every thread untitled again.
      */
      try {
        const res = await anthropic().messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 32,
          system: [
            {
              type: "text",
              text:
                "You name conversations between a high school student and their college counsellor. " +
                "Reply with a title of at most six words that says what the student is trying to work out. " +
                "No quotation marks, no trailing punctuation, no preamble. " +
                'Write it as a topic, not a sentence: "Balancing my list" not "The student wants to balance their list".',
            },
          ],
          messages: [
            {
              role: "user",
              content: `Student asked:\n${firstMessage.slice(0, 600)}\n\nCounsellor replied:\n${reply.slice(0, 600)}`,
            },
          ],
        });
        const raw = textOf(res.content).trim();
        meter("thread_title", res.usage as UsageCounts, "claude-haiku-4-5-20251001");

        // A model that ignores the brief must not produce a worse title than
        // the student's own words would have.
        const cleaned = raw.replace(/^["'\s]+|["'.\s]+$/g, "").replace(/\s+/g, " ");
        if (!cleaned || cleaned.length > 60 || cleaned.split(" ").length > 8) {
          return localTitle(firstMessage);
        }
        return cleaned;
      } catch {
        return localTitle(firstMessage);
      }
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
      earlier: InterviewExchange[] = [],
    ): Promise<InterviewFeedback> {
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["tooBrief", "strengths", "toWorkOn", "followUp", "nextQuestion"],
        properties: {
          tooBrief: { type: "boolean" },
          strengths: { type: "array", items: { type: "string" } },
          toWorkOn: { type: "array", items: { type: "string" } },
          followUp: { type: "string" },
          // Structured, so the UI stops regex-scraping it out of prose.
          nextQuestion: { type: "string" },
        },
      };

      /*
        The session so far. Without it every turn was judged alone, and the
        next question was picked blind: the app would ask "Tell me about
        yourself" twice in five minutes, and never follow a thread the
        student had just opened.
      */
      const sofar = earlier.length
        ? `Earlier in this practice session (oldest first):
${earlier
  .map((t, i) => `${i + 1}. Q: ${t.question}\n   A: """${t.answer}"""`)
  .join("\n")}

`
        : "";

      // Counted here rather than left to the model: "short" should mean the
      // same thing every time, and the app shows it.
      const words = answer.trim().split(/\s+/).filter(Boolean).length;

      const { data: turn, usage } = await askJson<InterviewFeedback & { nextQuestion: string; tooBrief: boolean }>(
        chatSystemPrompt(profile, schoolContextNote(school, profile.homeState)),
        `Mock interview${school ? ` for ${school.name}` : ""}. You are playing the interviewer and coaching at the same time.

${sofar}Question just asked: ${question}
Their answer (${words} words): """${answer}"""

Give 1–3 genuine strengths and 1–3 concrete things to work on, each one short
line.

"tooBrief" is true when the answer is too thin to carry a real interview —
under about 40 words, or a general claim with no specific moment, example or
reason behind it. A real answer runs about a minute out loud (5–8
sentences). When it's true, don't treat a thin answer as finished: the FIRST
"toWorkOn" line names the problem plainly and says what to add (a specific
moment, what they did, why it mattered), strengths can be a single line or
none, and followUp tells them directly but kindly that an interviewer would
want much more than that — this is the most useful thing you can say about
this answer.

"followUp" is your reply, and it will be READ ALOUD to the student in your
voice, so write it for the ear: 2–4 sentences, warm and direct, first person
("I liked…", "I wanted more of…"), addressed to them as "you". Plain spoken
English — no lists, headings, quotation marks around phrases, emoji, or
markdown. React to what they actually said.

"nextQuestion" is the single question you'd ask next, phrased the way an
interviewer would say it out loud. Build on what they've said this session —
pick up a thread they opened, or move to ground not yet covered — and never
repeat a question already asked. Put it in nextQuestion only: followUp must
not contain it, hint at it, or end with any question.`,
        schema,
        // Thinking draws on this too, and the session history makes the
        // prompt longer than the old single-pair ask. 1200 left little room.
        2048,
        // The student is sitting in silence until this returns. Sonnet at
        // low effort answers in ~4s where Opus at medium took 8–10s, and the
        // coaching holds up (measured 2026-10-09).
        INTERVIEW_SPEED,
      );
      meter("interview", usage, INTERVIEW_SPEED.model);
      return { ...turn, tooBrief: turn.tooBrief || words < 20 };
    },

    async readTranscript(file): Promise<TranscriptReading> {
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["looksLikeTranscript", "courses", "notes", "reportedGpa"],
        properties: {
          looksLikeTranscript: { type: "boolean" },
          // Read off the document, never computed. See TRANSCRIPT_SYSTEM.
          reportedGpa: {
            type: "object",
            additionalProperties: false,
            required: ["unweighted", "weighted", "credits"],
            properties: {
              unweighted: { anyOf: [{ type: "number" }, { type: "null" }] },
              weighted: { anyOf: [{ type: "number" }, { type: "null" }] },
              credits: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
          },
          courses: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["year", "subject", "name", "level", "grade", "term", "credits"],
              properties: {
                year: { type: "integer", enum: [9, 10, 11, 12] },
                subject: { type: "string", enum: SUBJECTS },
                name: { type: "string" },
                level: { type: "string", enum: ["regular", "honors", "ap", "ib"] },
                // Nullable rather than absent: structured output enforces
                // `required`, and a course in progress genuinely has no grade.
                grade: { anyOf: [{ type: "string" }, { type: "null" }] },
                term: { anyOf: [{ type: "string" }, { type: "null" }] },
                credits: { anyOf: [{ type: "number" }, { type: "null" }] },
              },
            },
          },
          notes: { type: "array", items: { type: "string" } },
        },
      };

      const { data, usage, truncated } = await askJsonStreamed<{
        looksLikeTranscript: boolean;
        reportedGpa: {
          unweighted: number | null;
          weighted: number | null;
          credits: number | null;
        } | null;
        courses: (Omit<ExtractedCourse, "grade" | "term" | "credits"> & {
          grade: string | null;
          term: string | null;
          credits: number | null;
        })[];
        notes: string[];
      }>(
        TRANSCRIPT_SYSTEM,
        [
          documentBlockFor(file),
          {
            type: "text",
            text: `This is a high school transcript uploaded by the student (filename: ${file.filename}). Read every course it lists.`,
          },
        ],
        schema,
        /*
          Sized for the worst realistic case, not the average one: a
          four-year transcript with fifty courses is ~7,000 tokens of JSON,
          and thinking draws on the same budget. The first version allowed
          8,000 and cut a real transcript off mid-array.
        */
        32000,
      );
      meter("transcript", usage);

      if (truncated) {
        throw new UserFacingError(
          "That transcript was longer than we could read in one pass. Try uploading it a page or a year at a time.",
        );
      }

      return {
        looksLikeTranscript: data.looksLikeTranscript,
        reportedGpa: {
          unweighted: data.reportedGpa?.unweighted ?? null,
          weighted: data.reportedGpa?.weighted ?? null,
          credits: data.reportedGpa?.credits ?? null,
        },
        notes: (data.notes ?? []).filter((n) => n.trim().length > 0),
        courses: (data.courses ?? [])
          .filter((c) => c.name?.trim())
          .map((c) => ({
            year: c.year,
            subject: c.subject,
            name: c.name.trim(),
            level: c.level,
            ...(c.grade ? { grade: c.grade.trim() } : {}),
            ...(c.term ? { term: c.term.trim() } : {}),
            ...(c.credits != null ? { credits: c.credits } : {}),
          })),
      };
    },
  };
}
