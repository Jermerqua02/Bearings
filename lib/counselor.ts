/* ————————————————————————————————————————
   Counselor AI service — THE single AI boundary.

   Every model call in the app goes through `counselor`.
   To go live: implement `CounselorService` against your
   provider (Anthropic, OpenAI, etc.) and swap the export
   at the bottom. Nothing else in the app changes.
   ———————————————————————————————————————— */

import type {
  ChanceTier,
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
  followUp: string;
}

export interface CounselorService {
  chat(req: CounselorRequest): Promise<CounselorResponse>;
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
  /** Mock-interview turn: next question + feedback on the last answer. */
  interviewTurn(
    profile: StudentProfile,
    school: School | null,
    question: string,
    answer: string
  ): Promise<InterviewFeedback>;
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

  async chat(req) {
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
      followUp: school
        ? `Good. Next: ${school.shortName} interviewers often ask — "What would you add to our campus that isn't already here?" Take a minute before answering.`
        : `Next question: "Tell me about a time you changed your mind about something that mattered to you."`,
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
};

/* ————————————— The swap point ————————————— */

/** Swap `mockCounselor` for a real implementation when API keys land. */
export const counselor: CounselorService = mockCounselor;
