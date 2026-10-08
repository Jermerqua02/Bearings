/* ————————————————————————————————————————
   What the counselor remembers, and how it's filed.

   Shared by the server (extraction, prompts, the API) and anything that
   renders memory, so the topics read the same everywhere. Deliberately free
   of server-only imports.
   ———————————————————————————————————————— */

export const MEMORY_CATEGORIES = [
  {
    id: "academics",
    label: "Academics",
    description: "Classes, grades, test plans, subjects you love or dread",
  },
  {
    id: "activities",
    label: "Activities & achievements",
    description: "What you do outside class, roles, awards, jobs",
  },
  {
    id: "goals",
    label: "Goals & interests",
    description: "Majors, careers, ideas you keep coming back to",
  },
  {
    id: "preferences",
    label: "What you want in a college",
    description: "Place, size, feel, programs, schools you're drawn to",
  },
  {
    id: "circumstances",
    label: "Circumstances",
    description: "Cost, family, distance, timing — what shapes the decision",
  },
  {
    id: "story",
    label: "Your story",
    description: "Background, experiences and values that make you you",
  },
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]["id"];

export const MEMORY_CATEGORY_IDS: readonly string[] = MEMORY_CATEGORIES.map((c) => c.id);

export function isMemoryCategory(v: unknown): v is MemoryCategory {
  return typeof v === "string" && MEMORY_CATEGORY_IDS.includes(v);
}

export interface MemoryFact {
  id: string;
  category: MemoryCategory;
  fact: string;
  source: "chat" | "student";
  createdAt: string;
}

/** Keeps the prompt — and the student's list — readable. */
export const MAX_MEMORIES = 150;
