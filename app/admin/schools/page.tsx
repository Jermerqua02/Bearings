import type { Metadata } from "next";
import { count, desc, eq } from "drizzle-orm";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import SchoolsAdmin, { type LeadRow, type LicenseRow } from "./SchoolsAdmin";
import { db } from "@/lib/db";
import { schoolLeads, schoolLicenses, seatRedemptions } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Schools · Lumni admin" };
export const dynamic = "force-dynamic";

export default async function AdminSchoolsPage() {
  const [leads, licenses, used] = await Promise.all([
    db.select().from(schoolLeads).orderBy(desc(schoolLeads.createdAt)).limit(300),
    db.select().from(schoolLicenses).orderBy(desc(schoolLicenses.createdAt)),
    db.select({ licenseId: seatRedemptions.licenseId, n: count() }).from(seatRedemptions).groupBy(seatRedemptions.licenseId),
  ]);
  const usedBy = new Map(used.map((u) => [u.licenseId, u.n]));

  const leadRows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    schoolName: l.schoolName,
    contactName: l.contactName,
    role: l.role,
    email: l.email,
    students: l.students,
    message: l.message,
    source: l.source,
    status: l.status,
    notes: l.notes,
    createdAt: l.createdAt.toISOString(),
  }));
  const licenseRows: LicenseRow[] = licenses.map((l) => ({
    id: l.id,
    orgName: l.orgName,
    contactEmail: l.contactEmail,
    code: l.code,
    seats: l.seats,
    used: usedBy.get(l.id) ?? 0,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    priceCents: l.priceCents,
    invoiceStatus: l.invoiceStatus,
    revoked: !!l.revokedAt,
  }));
  const fresh = leads.filter((l) => l.status === "new").length;
  const active = licenseRows.filter((l) => !l.revoked).length;

  return (
    <div>
      <SectionLabel className="mb-4">Schools</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>
          {active} license{active === 1 ? "" : "s"}
        </em>
        {fresh > 0 ? `, ${fresh} new inquir${fresh === 1 ? "y" : "ies"}.` : "."}
      </TwoTone>
      <SchoolsAdmin leads={leadRows} licenses={licenseRows} />
      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Schools are invoiced directly, outside the App Store (guideline 3.1.3(c), Enterprise Services). Send the
        school its code; each student who enters it in the app — Settings › I have a school code — uses a seat and
        has Pro until the license ends. Ending a license ends that Pro at once. Inquiries come from the
        marketing site&apos;s For schools page and from the app, and are emailed to admins.
      </p>
    </div>
  );
}
