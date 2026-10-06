/* ————————————————————————————————————————
   The student's own answers, in the shape the form will ask for them.

   The hard part of applying is not knowing what to say. It is saying it in
   fifty characters. A student who has written a good paragraph about being
   captain of Science Olympiad discovers, inside the real application with a
   deadline that day, that the position field holds fifty characters and the
   description holds a hundred and fifty. So they cut in a hurry, in a text
   box they cannot save, and the result is worse than what they had.

   This assembles everything they have already told us into the target
   format, with the limits enforced where they can be seen and fixed calmly.

   Pure, and free of `server-only`, for the same reason lib/format.ts is: the
   same function has to serve the on-screen panel, the clipboard copy and the
   download. It reads an AppSnapshot and returns structure — no formatting
   decisions, no markup, and no model call. A student's packet must not
   depend on an API being up.

   Two traps that cost real debugging and are easy to walk back into:
   `profile.activities` is always empty by design — activities live in their
   own slice — and `Essay.versions` is always empty in a snapshot, because
   versions load on demand.
   ———————————————————————————————————————— */

import type {
  Activity,
  Essay,
  Recommender,
  School,
  UniversalProfile,
} from "@/lib/types";

/**
 * Exactly the slices a packet needs.
 *
 * Named explicitly rather than taking an `AppSnapshot`, because that type
 * lives in a `server-only` module and this has to run in the browser. It
 * also documents the dependency: a packet is a function of what the student
 * has entered, and nothing else.
 */
export interface PacketInput {
  universal: UniversalProfile;
  activities: Activity[];
  essays: Essay[];
  recommenders: Recommender[];
}

/**
 * Common App's field limits.
 *
 * Verified against Common App's own applicant guidance. These are the
 * defaults because Common App is the form most students will meet; a school
 * on another platform still gets every answer, and the packet says the
 * limits are not binding there.
 */
export const COMMON_APP = {
  activitySlots: 10,
  positionChars: 50,
  organizationChars: 100,
  descriptionChars: 150,
  essayWords: 650,
  honorSlots: 5,
} as const;

/** A single answer, with the limit it has to fit and whether it does. */
export interface Field {
  label: string;
  value: string;
  /** Absent when nothing constrains this field. */
  limit?: { used: number; max: number; unit: "characters" | "words" };
  /** Nothing entered yet. Distinct from entered-and-too-long. */
  empty: boolean;
}

export interface PacketActivity {
  position: Field;
  organization: Field;
  description: Field;
  /** "9, 10, 11" — the years the student took part. */
  years: string;
  hours: string;
}

export interface PacketSection {
  title: string;
  /** Shown under the title when the section needs explaining. */
  note?: string;
  fields: Field[];
}

export interface Packet {
  school: School;
  /** The platform this packet is shaped for, in words. */
  shapedFor: string;
  /** True when the school files through some other system. */
  approximate: boolean;
  sections: PacketSection[];
  activities: PacketActivity[];
  /** Activities beyond the platform's slot count, which will not fit. */
  overflow: number;
  essays: { title: string; prompt: string; body: Field }[];
  /** What the student still has to do before this is submittable. */
  gaps: string[];
}

/* ————————————— Fields ————————————— */

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function chars(label: string, value: string, max: number): Field {
  const v = value.trim();
  return {
    label,
    value: v,
    limit: { used: v.length, max, unit: "characters" },
    empty: v.length === 0,
  };
}

function plain(label: string, value: string): Field {
  const v = value.trim();
  return { label, value: v, empty: v.length === 0 };
}

export function overLimit(f: Field): boolean {
  return !!f.limit && f.limit.used > f.limit.max;
}

/* ————————————— Activities ————————————— */

const GRADE_LABEL: Record<number, string> = { 9: "9", 10: "10", 11: "11", 12: "12" };

/**
 * Activities in the order the student ranked them.
 *
 * `position` is null until they say, and unranked activities keep the order
 * they were entered in rather than being silently assigned one — Common App
 * asks for these in order of significance, and inventing that order would
 * put words in the student's mouth about what matters to them.
 */
export function orderActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    const ap = a.position;
    const bp = b.position;
    if (ap != null && bp != null) return ap - bp;
    if (ap != null) return -1;
    if (bp != null) return 1;
    return 0;
  });
}

function toPacketActivity(a: Activity): PacketActivity {
  const years = a.yearsInvolved
    .map((y) => GRADE_LABEL[y as number])
    .filter(Boolean)
    .join(", ");
  return {
    position: chars("Position / Leadership", a.role, COMMON_APP.positionChars),
    organization: chars("Organization", a.name, COMMON_APP.organizationChars),
    description: chars("Description", a.description, COMMON_APP.descriptionChars),
    years: years || "—",
    hours:
      a.hoursPerWeek > 0 || a.weeksPerYear > 0
        ? `${a.hoursPerWeek} hrs/wk · ${a.weeksPerYear} wks/yr`
        : "—",
  };
}

/* ————————————— Assembly ————————————— */

const PLATFORM_LABEL: Record<string, string> = {
  "common-app": "Common App",
  coalition: "the Coalition application",
  uc: "the UC application",
  "cal-state": "Cal State Apply",
  applytexas: "ApplyTexas",
  direct: "this school's own form",
};

/**
 * Everything one application will ask for, for one school.
 *
 * Sections a student has nothing for are still returned, with their fields
 * marked empty, because an absent section reads as "not required" and the
 * whole point is to show what is still missing.
 */
export function buildPacket(snap: PacketInput, school: School): Packet {
  const u = snap.universal;
  const platform = school.application?.platform;
  const isCommonApp = platform === "common-app";

  const sections: PacketSection[] = [
    {
      title: "Personal",
      fields: [
        plain("Legal name", u.legalName),
        plain("Preferred name", u.preferredName),
        plain("Date of birth", u.dateOfBirth),
        plain("Email", u.email),
        plain("Phone", u.phone),
        // The form asks for street, city, state and postcode separately; we
        // hold one line. Flagged rather than split on a guess, because a
        // wrong split is worse than an honest single field.
        plain("Address", u.address),
        plain("Citizenship", u.citizenship),
      ],
    },
    {
      title: "Education",
      fields: [
        plain("High school", u.highSchoolName),
        plain("School city", u.highSchoolCity),
        plain("Graduation year", u.gradYear),
        plain("First-generation / parent education", u.parentEducation),
      ],
    },
    {
      title: "Honors",
      note: `Up to ${COMMON_APP.honorSlots} on Common App.`,
      fields: u.honors.length
        ? u.honors.slice(0, COMMON_APP.honorSlots).map((h, i) => plain(`Honor ${i + 1}`, h))
        : [plain("Honor 1", "")],
    },
  ];

  const ordered = orderActivities(snap.activities);
  const activities = ordered.slice(0, COMMON_APP.activitySlots).map(toPacketActivity);
  const overflow = Math.max(0, ordered.length - COMMON_APP.activitySlots);

  const relevant = snap.essays.filter((e) => !e.schoolId || e.schoolId === school.id);
  const essays = relevant.map((e: Essay) => ({
    title: e.title,
    prompt: e.promptText,
    body: {
      label: e.schoolId ? "Supplement" : "Personal statement",
      value: e.text,
      limit: {
        used: words(e.text),
        // A supplement's own limit when the student recorded one; otherwise
        // the personal statement's, which is the only one we can know.
        max: e.wordLimit > 0 ? e.wordLimit : COMMON_APP.essayWords,
        unit: "words" as const,
      },
      empty: e.text.trim().length === 0,
    },
  }));

  /* ————— What is still missing ————— */

  const gaps: string[] = [];
  for (const s of sections) {
    const missing = s.fields.filter((f) => f.empty).map((f) => f.label);
    if (missing.length) gaps.push(`${s.title}: ${missing.join(", ")}`);
  }
  if (!ordered.length) gaps.push("No activities recorded yet");
  const longActivities = activities.filter(
    (a) => overLimit(a.position) || overLimit(a.organization) || overLimit(a.description),
  ).length;
  if (longActivities) {
    gaps.push(
      `${longActivities} activit${longActivities === 1 ? "y is" : "ies are"} over the character limit`,
    );
  }
  if (!essays.length) gaps.push("No essay written yet");
  const longEssays = essays.filter((e) => overLimit(e.body)).length;
  if (longEssays) gaps.push(`${longEssays} essay${longEssays === 1 ? " is" : "s are"} over the word limit`);

  const req = school.application?.requires;
  if (req?.recommendations === "required") {
    const assigned = snap.recommenders.filter((r) => r.schoolIds.includes(school.id));
    const needed = school.application?.teacherRecs ?? 0;
    if (assigned.length === 0) gaps.push("No recommender assigned to this school");
    else if (needed > 0 && assigned.length < needed) {
      gaps.push(`${assigned.length} of ${needed} recommenders assigned`);
    }
    const noEmail = assigned.filter((r) => !r.email.trim()).map((r) => r.name);
    if (noEmail.length) gaps.push(`No email for ${noEmail.join(", ")}`);
  }

  return {
    school,
    shapedFor: isCommonApp
      ? "Common App"
      : `${PLATFORM_LABEL[platform ?? "direct"] ?? "this school's own form"}, using Common App's limits as a guide`,
    approximate: !isCommonApp,
    sections,
    activities,
    overflow,
    essays,
    gaps,
  };
}

/* ————————————— Plain text, for copying ————————————— */

function fieldLine(f: Field): string {
  const v = f.value || "—";
  return `${f.label}: ${v}`;
}

/**
 * The packet as text a student can paste into a document.
 *
 * Deliberately plain: no markdown, no box drawing. It goes into whatever
 * they already keep their notes in.
 */
export function packetToText(p: Packet): string {
  const out: string[] = [
    `APPLICATION PACKET — ${p.school.name}`,
    `Prepared for ${p.shapedFor}`,
    "",
  ];

  for (const s of p.sections) {
    out.push(s.title.toUpperCase(), ...s.fields.map(fieldLine), "");
  }

  out.push(`ACTIVITIES (${p.activities.length} of ${COMMON_APP.activitySlots} slots)`);
  p.activities.forEach((a, i) => {
    out.push(
      `${i + 1}. ${a.organization.value || "—"}`,
      `   Position: ${a.position.value || "—"}`,
      `   ${a.description.value || "—"}`,
      `   Grades ${a.years} · ${a.hours}`,
    );
  });
  if (p.overflow) out.push(`(${p.overflow} more will not fit)`);
  out.push("");

  for (const e of p.essays) {
    out.push(
      e.title.toUpperCase(),
      e.prompt ? `Prompt: ${e.prompt}` : "Prompt: —",
      `${e.body.limit!.used} of ${e.body.limit!.max} words`,
      "",
      e.body.value || "—",
      "",
    );
  }

  if (p.gaps.length) out.push("STILL TO DO", ...p.gaps.map((g) => `- ${g}`), "");

  return out.join("\n");
}
