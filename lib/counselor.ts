/* ————————————————————————————————————————
   Counselor AI service — THE single AI boundary.

   Every model call in the app goes through `counselor`.
   To go live: implement `CounselorService` against your
   provider (Anthropic, OpenAI, etc.) and swap the export
   at the bottom. Nothing else in the app changes.
   ———————————————————————————————————————— */

import type {
  ChanceTier,
  ExtractedCourse,
  ReportedGpa,
  Profile,
  School,
  StudentProfile,
  Throughline,
} from "./types";

/* ————————————— Typed request/response ————————————— */

export interface CounselorMessage {
  id: string;
  author: "user" | "counselor";
  text: string;
  cards?: CounselorCard[];
  createdAt: string; // ISO
}

/** Rich inline cards the counselor can render alongside text. */
export type CounselorCard =
  | { kind: "school"; schoolId: string; reason: string }
  | { kind: "tier-breakdown"; tiers: { tier: ChanceTier; count: number }[] }
  | {
      kind: "checklist";
      title: string;
      items: { text: string; done: boolean }[];
    }
  | {
      kind: "comparison";
      schoolIds: string[];
      rows: { label: string; values: string[] }[];
    }
  | {
      kind: "timeline";
      items: { date: string; label: string; schoolId?: string }[];
    };

export interface CounselorRequest {
  profile: Profile;
  threadId: string;
  message: string;
  /** Optional context, e.g. a school page the chat was opened from. */
  context?: {
    schoolId?: string;
    screen?: string;
    /** The student's current list, rendered for the model. Server-supplied. */
    listSummary?: string;
    /**
     * Their course plan — transcript-read or hand-entered — with computed
     * GPA and rigor. Server-supplied, and the reason a recommendation can
     * name the actual courses they've taken.
     */
    courseworkSummary?: string;
    /** The school `schoolId` names, resolved by the server. */
    school?: School;
  };
  history: CounselorMessage[];
}

export interface CounselorResponse {
  message: CounselorMessage;
  /** Gentle nudges, e.g. "You haven't looked at any financial safeties yet." */
  nudge?: string;
}

export interface EssayFeedback {
  /** Observations on structure, specificity, voice. Questions, not rewrites. */
  observations: { area: "structure" | "specificity" | "voice"; note: string }[];
  questions: string[];
}

export interface InterviewFeedback {
  strengths: string[];
  toWorkOn: string[];
  /** The counselor's spoken reaction, first person. Never the next question. */
  followUp: string;
  /** What she'd ask next. Absent on turns saved before it was structured. */
  nextQuestion?: string;
  /** The answer was too short or too thin to judge properly. This turn only; not saved. */
  tooBrief?: boolean;
}

/** A question already asked and answered in the current practice session. */
export interface InterviewExchange {
  question: string;
  answer: string;
}

/**
 * What the model read off an uploaded transcript.
 *
 * `notes` is where it says what it couldn't read — a smudged column, a
 * grading scale it didn't recognise, a page that was clearly a second
 * school. That belongs in front of the student rather than in a log,
 * because they are the only one who can tell whether it matters.
 */
export interface TranscriptReading {
  courses: ExtractedCourse[];
  /** Caveats about the reading, in the student's language. */
  notes: string[];
  /** False when the file doesn't look like a transcript at all. */
  looksLikeTranscript: boolean;
  /**
   * The cumulative GPA printed on the document, if it prints one.
   *
   * Read rather than recomputed, and shown in preference to anything we
   * calculate. A school's own GPA follows rules we cannot reconstruct from
   * a course list, and disagreeing with the counselor's number is worse
   * than showing no number at all.
   */
  reportedGpa: ReportedGpa;
}

/** What a chat turn taught the counselor. See extractMemories. */
export interface MemoryChanges {
  add: { category: string; fact: string }[];
  update: { id: string; fact: string }[];
}

/**
 * What a chat turn is doing while the student waits, for a client that
 * streams. "thinking" before any words, "writing" once they start arriving,
 * "cards" while the schools/timelines under the answer are being put
 * together. Every hook is optional; a caller that ignores them gets the
 * same reply, just all at once.
 */
export interface ChatEvents {
  onPhase?(phase: "thinking" | "writing" | "cards"): void;
  /** The next piece of the answer's text, in order. */
  onText?(delta: string): void;
}

export interface CounselorService {
  chat(req: CounselorRequest, events?: ChatEvents): Promise<CounselorResponse>;
  greet(profile: Profile): Promise<CounselorMessage>;
  /** "Here's what I'm hearing about you" — end of onboarding. */
  summarizeProfile(profile: Profile): Promise<string>;
  generateThroughline(profile: StudentProfile): Promise<Throughline>;
  /** One-line, profile-specific reason a school fits. */
  whyThisSchool(profile: StudentProfile, school: School): Promise<string>;
  /** Critiques and asks questions. NEVER writes the essay. */
  essayFeedback(
    profile: StudentProfile,
    promptText: string,
    essayText: string
  ): Promise<EssayFeedback>;
  /**
   * Mock-interview turn: next question + feedback on the last answer.
   * `earlier` is what this session has already covered, oldest first, so
   * the next question builds on it instead of repeating it.
   */
  interviewTurn(
    profile: StudentProfile,
    school: School | null,
    question: string,
    answer: string,
    earlier?: InterviewExchange[]
  ): Promise<InterviewFeedback>;
  /**
   * A short name for a conversation, from how it opened.
   *
   * Every thread was called "New conversation", so a student's history was
   * seven identical rows and the only way to find anything was to open each
   * one. Deliberately not part of `chat` — a title is worth a small separate
   * call rather than complicating the reply the student is waiting for.
   */
  titleFor(firstMessage: string, reply: string): Promise<string>;
  /**
   * Durable facts about the student in one exchange, measured against what
   * is already remembered: new ones to add, existing ones the student has
   * now corrected. Empty when there's nothing worth keeping, which is most
   * turns.
   */
  extractMemories(input: {
    studentMessage: string;
    counselorReply: string;
    known: { id: string; category: string; fact: string }[];
    /** Whose notes these are; a parent's are about their family, in their own topics. */
    role?: "student" | "parent";
  }): Promise<MemoryChanges>;
  /**
   * Read an uploaded transcript into course rows.
   *
   * Takes raw bytes rather than text: a transcript is a PDF or a photo, and
   * extracting text from it first would throw away the table structure that
   * makes the columns legible in the first place.
   */
  readTranscript(file: {
    bytes: Buffer;
    contentType: string;
    filename: string;
  }): Promise<TranscriptReading>;
}

/**
 * A usable title without a model call.
 *
 * Used when the AI title fails or comes back unusable, on the principle
 * already established for onboarding summaries: the feature has a floor that
 * does not depend on an API being up. The student's own first sentence is a
 * decent name for a conversation — it is what they came to ask.
 */
export function localTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  // First sentence if it's a reasonable length, otherwise a clean word break.
  const sentence = cleaned.split(/(?<=[.?!])\s/)[0];
  const base = sentence.length <= 48 ? sentence : cleaned;
  if (base.length <= 48) return base.replace(/[.?!]+$/, "");
  return `${base.slice(0, 45).replace(/\s+\S*$/, "")}…`;
}

/* ————————————— Mock implementation ————————————— */

let idCounter = 0;
const mid = () => `msg-${++idCounter}-${Date.now()}`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isStudent(p: Profile): p is StudentProfile {
  return p.role === "student";
}

const mockCounselor: CounselorService = {
  async greet(profile) {
    await delay(400);
    const text = isStudent(profile)
      ? `Hi ${profile.firstName}. Last time we talked about your ${
          profile.undecided
            ? "interests — and no, being undecided is not a problem, it's honest"
            : `interest in ${profile.intendedMajors[0] ?? "your major"}`
        }. Where do you want to pick up today?`
      : `Hi ${profile.firstName}. I know this process looks nothing like it did when you applied — that's normal, and it's navigable. What's on your mind?`;
    return { id: mid(), author: "counselor", text, createdAt: new Date().toISOString() };
  },

  async chat(req, events) {
    events?.onPhase?.("thinking");
    await delay(700);
    const p = req.profile;
    const lower = req.message.toLowerCase();

    let text: string;
    let cards: CounselorCard[] | undefined;

    if (lower.includes("realistic")) {
      text = isStudent(p)
        ? `Fair question — let's look at it honestly. Based on your GPA and rigor, your current list breaks down like this. A balanced list usually has more likelies than reaches, and right now yours leans ambitious. That's fixable, and it doesn't mean lowering your sights — it means adding schools you'd actually be excited to attend.`
        : `A realistic list isn't about lowering expectations — it's about balance. Here's how your student's list currently breaks down. The healthiest lists have a solid base of likely schools the student genuinely likes.`;
      cards = [
        {
          kind: "tier-breakdown",
          tiers: [
            { tier: "reach", count: 4 },
            { tier: "target", count: 3 },
            { tier: "likely", count: 1 },
          ],
        },
      ];
    } else if (lower.includes("missing")) {
      text = `A few schools I think are underrated for your profile — places students with your interests often overlook because they've never heard of them. Worth twenty minutes each.`;
      cards = [
        { kind: "school", schoolId: "case-western", reason: "Research access without the acceptance-rate lottery." },
        { kind: "school", schoolId: "college-of-wooster", reason: "Every student does mentored research — not just the lucky ones." },
      ];
    } else if (lower.includes("early decision") || lower.includes("early action")) {
      text = `Plain-language version: Early Decision (ED) is binding — if admitted, you commit to attend and withdraw other applications. Early Action (EA) is early but not binding. ED can help your odds at some schools, but it locks in your financial aid offer before you can compare. If cost matters to your decision — and for most families it should — be careful with ED. Want me to walk through how this applies to specific schools on your list?`;
    } else if (lower.includes("worth the money") || lower.includes("cost")) {
      text = `The honest answer depends on net price, not sticker price — what you'd actually pay after aid. For your budget, I'd want to compare the likely net cost across your list before forming an opinion. Sticker prices are close to meaningless for most families.`;
    } else {
      text = isStudent(p)
        ? `Let me think about that in the context of your profile — your ${
            p.gpa.unweighted ?? "GPA"
          } GPA, ${p.rigor.apCount} APs, and what you've told me you care about. (This is a mock response; the real model plugs in via lib/counselor.ts.)`
        : `Good question. Here's how I'd frame it for where your student is right now. (This is a mock response; the real model plugs in via lib/counselor.ts.)`;
    }

    events?.onPhase?.("writing");
    events?.onText?.(text);
    return {
      message: { id: mid(), author: "counselor", text, cards, createdAt: new Date().toISOString() },
      nudge:
        isStudent(p) && Math.random() > 0.6
          ? "You haven't looked at any financial safeties yet."
          : undefined,
    };
  },

  async summarizeProfile(profile) {
    await delay(600);
    if (isStudent(profile)) {
      const p = profile;
      const majorLine = p.undecided
        ? "You're undecided about a major — which, for the record, is an honest and completely normal place to be"
        : `You're drawn to ${p.intendedMajors.join(" and ")}`;
      return `Here's what I'm hearing: you're a ${p.gradeLevel}th grader with a ${
        p.gpa.unweighted ?? "—"
      } unweighted GPA and ${
        p.rigor.apCount + p.rigor.ibCount + p.rigor.honorsCount
      } advanced courses so far. ${majorLine}. You'd like to be somewhere ${p.campus.settings.join(
        " or "
      )}, and cost matters — we'll always talk in net price, not sticker price. Did I get that right? You can edit anything below.`;
    }
    const p = profile;
    return `Here's what I'm hearing: you're the ${p.relationship} of a ${p.studentGrade}th grader, and your biggest worry right now is "${p.biggestWorry}". You want to be ${p.involvementLevel.replace(/-/g, " ")} in this process. That's a good instinct — the research is clear that supported-but-not-managed students do best. Did I get that right?`;
  },

  async generateThroughline(profile) {
    await delay(800);
    const stillForming = profile.gradeLevel <= 10;
    return {
      paragraph: stillForming
        ? `Your story is still taking shape — that's exactly right for ${profile.gradeLevel}th grade. Early signals: you commit deeply to the things you choose rather than collecting activities, and your interests keep circling back to how things work and why people do what they do. Let's keep noticing.`
        : `The thread running through your profile: you're someone who turns curiosity into building. Your coursework, your activities, and the way you spend unstructured time all point at the same instinct — you don't just study subjects, you make things with them. That's what an admissions reader will remember.`,
      evidence: stillForming
        ? ["Depth over breadth", "Self-directed learning"]
        : ["3 years of robotics, 2 as lead", "AP CS + AP Physics pairing", "Self-taught web development", "Tutoring younger students"],
      stillForming,
    };
  },

  async essayFeedback(_profile, _promptText, essayText) {
    await delay(900);
    const words = essayText.trim().split(/\s+/).filter(Boolean).length;
    return {
      observations: [
        {
          area: "structure",
          note:
            words < 150
              ? "This is still early — right now it reads like an opening in search of a middle. Where does the story go after this moment?"
              : "The opening earns attention, but the middle section summarizes where it could show. One scene, told slowly, would do more than three told quickly.",
        },
        {
          area: "specificity",
          note: "The strongest sentence here is the most concrete one. Notice which sentence that is — then ask why the others aren't doing that.",
        },
        {
          area: "voice",
          note: "Parts of this sound like you talking; parts sound like an essay trying to impress. Read it aloud — you'll hear exactly where the seam is.",
        },
      ],
      questions: [
        "What detail from this experience do you remember that nobody else would?",
        "If you couldn't mention the achievement itself, what would you say you learned?",
        "What's the sentence you're proudest of? What's the one you secretly know is filler?",
      ],
    };
  },

  async interviewTurn(_profile, school, _question, answer) {
    await delay(800);
    const short = answer.trim().split(/\s+/).filter(Boolean).length < 40;
    return {
      tooBrief: short,
      strengths: short
        ? ["You answered directly, without padding — that's rarer than you'd think."]
        : [
            "You gave a real example rather than an abstraction.",
            "Your energy came through — interviewers remember that more than polish.",
          ],
      toWorkOn: short
        ? [
            "This answer needs one concrete story. Interviews are remembered in scenes, not summaries.",
            "Try the rule of one: one example, told with detail, beats three mentioned in passing.",
          ]
        : [
            "Trim the wind-up — start with the example, then explain why it matters.",
          ],
      followUp: short
        ? "I like that you got straight to it. Now I want the story behind it — give me one moment I could picture."
        : "That had a real example in it, and I could hear that it mattered to you. Let's keep going.",
      nextQuestion: school
        ? `What would you add to ${school.shortName} that isn't already there?`
        : "Tell me about a time you changed your mind about something that mattered to you.",
    };
  },

  async whyThisSchool(profile, school) {
    await delay(500);
    return `For someone with your interest in ${
      profile.undecided ? "exploring broadly" : profile.intendedMajors[0]
    } and your preference for a ${profile.campus.settings[0] ?? "college-town"} setting, ${
      school.shortName
    } hits an unusual combination: ${school.academics.notablePrograms[0]}, and a culture that students describe as "${school.life.vibe.toLowerCase()}"`;
  },

  async extractMemories() {
    return { add: [], update: [] };
  },

  async titleFor(firstMessage) {
    await delay(200);
    return localTitle(firstMessage);
  },

  /*
    The mock cannot read a file, and pretending otherwise would be worse
    than admitting it — a plausible invented course list is exactly the
    kind of thing a student would accept without checking. So it returns
    nothing found, with a note saying why.
  */
  async readTranscript(file) {
    await delay(600);
    return {
      courses: [],
      notes: [
        `Transcript reading isn't available in this environment, so ${file.filename} was stored but not read. You can still add courses by hand below.`,
      ],
      looksLikeTranscript: true,
      reportedGpa: { unweighted: null, weighted: null, credits: null },
    };
  },
};

/* ————————————— The swap point ————————————— */

/** Swap `mockCounselor` for a real implementation when API keys land. */
export const counselor: CounselorService = mockCounselor;
