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

/**
 * A parent's topics. Their counselor files what they say about themselves,
 * their family and their student — seen through a parent's eyes, and kept
 * private to the parent the same way a student's notes are to the student.
 */
export const PARENT_MEMORY_CATEGORIES = [
  {
    id: "student",
    label: "About your student",
    description: "Who they are, what they're good at, how they're doing",
  },
  {
    id: "money",
    label: "Money & aid",
    description: "What the family can pay, savings, aid and work plans",
  },
  {
    id: "family",
    label: "Family & circumstances",
    description: "Siblings, work, health, moves — what shapes the decision",
  },
  {
    id: "hopes",
    label: "Hopes & worries",
    description: "What you want for them, and what keeps you up at night",
  },
  {
    id: "wants",
    label: "What you're looking for",
    description: "Distance, size, cost, safety, schools you like or have ruled out",
  },
] as const;

export type MemoryCategory =
  | (typeof MEMORY_CATEGORIES)[number]["id"]
  | (typeof PARENT_MEMORY_CATEGORIES)[number]["id"];

export const MEMORY_CATEGORY_IDS: readonly string[] = [
  ...MEMORY_CATEGORIES.map((c) => c.id),
  ...PARENT_MEMORY_CATEGORIES.map((c) => c.id),
];

/** The topics for whoever is talking to the counselor. */
export function memoryCategoriesFor(role: string) {
  return role === "parent" ? PARENT_MEMORY_CATEGORIES : MEMORY_CATEGORIES;
}

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
