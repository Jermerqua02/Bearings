import "server-only";

import type { Activity, CoursePlanEntry, GradeLevel } from "@/lib/types";
import { BadRequest, oneOf, str } from "@/lib/api/v1";

/* The wire values the planner accepts. Same idea as lib/api/list.ts: the
   actions trust their typed arguments, HTTP gives us none. */
export const SUBJECTS: readonly CoursePlanEntry["subject"][] = [
  "English", "Math", "Science", "Social Studies", "Language", "Arts", "Elective",
];
export const LEVELS: readonly CoursePlanEntry["level"][] = ["regular", "honors", "ap", "ib"];
export const COURSE_STATUSES: readonly CoursePlanEntry["status"][] = ["completed", "in-progress", "planned"];

export function grade(value: unknown): GradeLevel {
  if (value === 9 || value === 10 || value === 11 || value === 12) return value;
  throw new BadRequest("Invalid year.");
}

function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new BadRequest(`Invalid ${field}.`);
  }
  return Math.round(value);
}

/** A course patch, validated field by field; absent keys stay absent. */
export function coursePatch(b: Record<string, unknown>): Partial<CoursePlanEntry> {
  const p: Partial<CoursePlanEntry> = {};
  if (b.year !== undefined) p.year = grade(b.year);
  if (b.subject !== undefined) p.subject = oneOf(b.subject, SUBJECTS, "subject");
  if (b.name !== undefined) p.name = str(b.name, "name", 120).trim();
  if (b.level !== undefined) p.level = oneOf(b.level, LEVELS, "level");
  if (b.status !== undefined) p.status = oneOf(b.status, COURSE_STATUSES, "status");
  if (b.grade !== undefined) p.grade = str(b.grade, "grade", 8);
  return p;
}

export function activityPatch(b: Record<string, unknown>): Partial<Activity> {
  const p: Partial<Activity> = {};
  if (b.name !== undefined) p.name = str(b.name, "name", 100).trim();
  if (b.role !== undefined) p.role = str(b.role, "role", 100).trim();
  if (b.description !== undefined) p.description = str(b.description, "description", 2000);
  if (b.hoursPerWeek !== undefined) p.hoursPerWeek = int(b.hoursPerWeek, "hours", 0, 80);
  if (b.weeksPerYear !== undefined) p.weeksPerYear = int(b.weeksPerYear, "weeks", 0, 52);
  if (b.leadership !== undefined) {
    if (typeof b.leadership !== "boolean") throw new BadRequest("Invalid leadership.");
    p.leadership = b.leadership;
  }
  if (b.yearsInvolved !== undefined) {
    if (!Array.isArray(b.yearsInvolved)) throw new BadRequest("Invalid years.");
    p.yearsInvolved = [...new Set(b.yearsInvolved.map(grade))].sort();
  }
  return p;
}
