/* ————————————————————————————————————————
   Schools: inquiries, licenses, and seats (docs/plans/lumni-pro.md, step 5).

   A school or nonprofit asks — from the marketing site or the app — and
   admins are emailed. Selling is by invoice, outside the App Store, which
   guideline 3.1.3(c) (Enterprise Services) allows for organizations buying
   for their students. A license has a number of seats, dates, and one code
   (LINCOLN-7Q2K); each student who enters the code uses a seat and gets Pro
   (source "school") until the license ends. Ending a license early ends
   the Pro it gave.
   ———————————————————————————————————————— */

import "server-only";

import { randomInt } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, entitlements, schoolLeads, schoolLicenses, seatRedemptions } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/actions/_error";
import { schoolLeadEmail } from "@/lib/email";
import { proRemoved } from "@/lib/entitlements";
import { adminUrl, notifyAdmins } from "@/lib/admin-notify";
import type { Viewer } from "@/lib/auth/policy";

export interface LeadInput {
  schoolName: string;
  contactName: string;
  role?: string;
  email: string;
  students?: number | null;
  message?: string;
}

const clip = (s: string | undefined | null, n: number) => (s ?? "").trim().slice(0, n);

/** Record an inquiry and tell the admins. */
export async function createSchoolLead(input: LeadInput, source: "site" | "app", userId?: string): Promise<void> {
  const schoolName = clip(input.schoolName, 200);
  const contactName = clip(input.contactName, 120);
  const email = clip(input.email, 200).toLowerCase();
  if (!schoolName) throw new UserFacingError("Which school or organization?");
  if (!contactName) throw new UserFacingError("Who should we talk to?");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFacingError("Enter an email address we can reach you at.");
  const students =
    input.students == null || Number.isNaN(Number(input.students)) ? null : Math.max(0, Math.min(1_000_000, Math.round(Number(input.students))));
  const role = clip(input.role, 120) || null;
  const message = clip(input.message, 2_000) || null;

  await db.insert(schoolLeads).values({ schoolName, contactName, role, email, students, message, source, userId: userId ?? null });
  await notifyAdmins(schoolLeadEmail({ schoolName, contactName, role, email, students, message, source, adminUrl: adminUrl("/admin/schools") }));
}

// No 0/O, 1/I/L — codes are read aloud in classrooms and typed from handouts.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** "Lincoln High School" → "LINCOLN-7Q2K". */
function makeCode(orgName: string): string {
  const word =
    orgName
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .find((w) => w.length >= 3 && !["THE", "HIGH", "SCHOOL", "ACADEMY", "OF"].includes(w)) ?? "SCHOOL";
  const tail = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${word.slice(0, 10)}-${tail}`;
}

export async function createSchoolLicense(
  adminId: string,
  input: { orgName: string; contactEmail?: string; seats: number; endsAt: string; priceCents?: number | null; invoiceStatus?: string; leadId?: string | null; notes?: string },
): Promise<{ id: string; code: string }> {
  const orgName = clip(input.orgName, 200);
  if (!orgName) throw new UserFacingError("Name the school or organization.");
  const seats = Math.round(Number(input.seats));
  if (!Number.isFinite(seats) || seats < 1 || seats > 100_000) throw new UserFacingError("Seats must be a number from 1 up.");
  const endsAt = new Date(`${input.endsAt}T23:59:59.999Z`);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= new Date()) throw new UserFacingError("The license has to end in the future.");
  const invoiceStatus = ["pilot", "invoiced", "paid", "overdue"].includes(input.invoiceStatus ?? "") ? input.invoiceStatus! : "pilot";

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(orgName);
    try {
      const [row] = await db
        .insert(schoolLicenses)
        .values({
          orgName,
          contactEmail: clip(input.contactEmail, 200) || null,
          seats,
          endsAt,
          code,
          priceCents: input.priceCents ?? null,
          invoiceStatus,
          leadId: input.leadId ?? null,
          notes: clip(input.notes, 2_000) || null,
          createdBy: adminId,
        })
        .returning({ id: schoolLicenses.id, code: schoolLicenses.code });
      if (input.leadId) {
        await db.update(schoolLeads).set({ status: invoiceStatus === "pilot" ? "piloting" : "customer", updatedAt: new Date() }).where(eq(schoolLeads.id, input.leadId));
      }
      return row;
    } catch (err) {
      if (!(err instanceof Error && /school_license_code_unique|duplicate key/.test(err.message))) throw err;
    }
  }
  throw new Error("Could not make a unique license code.");
}

/** A student (or parent) enters their school's code. */
export async function redeemSchoolCode(viewer: Viewer, input: string): Promise<{ orgName: string; endsAt: Date }> {
  if (viewer.role !== "student" && viewer.role !== "parent") throw new UserFacingError("School codes are for student and parent accounts.");
  // A seat would give them nothing, and use up one of the school's.
  if (await proRemoved(viewer.userId)) throw new UserFacingError("Pro isn't available on this account. Write to support@promptllc.com if you think that's a mistake.");
  const code = input.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");
  const [license] = await db.select().from(schoolLicenses).where(eq(schoolLicenses.code, code)).limit(1);
  const now = new Date();
  if (!license || license.revokedAt || license.endsAt <= now || license.startsAt > now) {
    throw new UserFacingError("That code isn't active. Check it with your school counselor.");
  }

  return db.transaction(async (tx) => {
    const [already] = await tx
      .select({ id: seatRedemptions.id })
      .from(seatRedemptions)
      .where(and(eq(seatRedemptions.licenseId, license.id), eq(seatRedemptions.userId, viewer.userId)))
      .limit(1);
    if (already) throw new UserFacingError(`You're already using a seat from ${license.orgName}.`);

    const [{ used }] = await tx.select({ used: count() }).from(seatRedemptions).where(eq(seatRedemptions.licenseId, license.id));
    if (used >= license.seats) throw new UserFacingError(`${license.orgName}'s seats are all in use. Let your school counselor know.`);

    const [ent] = await tx
      .insert(entitlements)
      .values({ userId: viewer.userId, source: "school", startsAt: now, endsAt: license.endsAt, note: license.orgName })
      .returning({ id: entitlements.id });
    await tx.insert(seatRedemptions).values({ licenseId: license.id, userId: viewer.userId, entitlementId: ent.id });
    await tx.insert(accountEvents).values({
      userId: viewer.userId,
      actorKind: "user",
      actorId: viewer.userId,
      action: "pro.school_code",
      reason: license.orgName,
      detail: { entitlementId: ent.id, licenseId: license.id, endsAt: license.endsAt.toISOString() },
    });
    return { orgName: license.orgName, endsAt: license.endsAt };
  });
}

/** End a license now, and the Pro each of its seats gave. */
export async function revokeSchoolLicense(adminId: string, licenseId: string): Promise<number> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [license] = await tx
      .update(schoolLicenses)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(schoolLicenses.id, licenseId), isNull(schoolLicenses.revokedAt)))
      .returning({ id: schoolLicenses.id, orgName: schoolLicenses.orgName });
    if (!license) throw new UserFacingError("That license is already ended.");
    const seats = await tx.select().from(seatRedemptions).where(eq(seatRedemptions.licenseId, licenseId));
    const ids = seats.map((s) => s.entitlementId).filter((x): x is string => !!x);
    if (ids.length) await tx.update(entitlements).set({ revokedAt: now, updatedAt: now }).where(inArray(entitlements.id, ids));
    if (seats.length) {
      await tx.insert(accountEvents).values(
        seats.map((s) => ({
          userId: s.userId,
          actorId: adminId,
          actorKind: "admin",
          action: "pro.revoked",
          reason: `${license.orgName}'s license ended`,
          detail: { licenseId, entitlementId: s.entitlementId },
        })),
      );
    }
    return seats.length;
  });
}
