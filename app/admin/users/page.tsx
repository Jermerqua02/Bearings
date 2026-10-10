import type { Metadata } from "next";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import Card from "@/components/ui/Card";
import UsersTable, { type Row } from "./UsersTable";
import { accounts, userCosts } from "@/lib/db/queries/admin";
import { proStatuses, type ProStatus } from "@/lib/entitlements";
import { getViewer } from "@/lib/auth/policy";
import { formatBytes, formatMillicents } from "@/lib/costs";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Users · Lumni admin" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  app_store: "App Store",
  admin: "granted",
  free_access: "free access",
  school: "school",
  staff: "staff",
};

function planOf(status: ProStatus | undefined): Row["plan"] {
  if (!status || status.tier === "free") return { tier: "free", label: "Free", until: null };
  const source = SOURCE_LABEL[status.source] ?? status.source;
  return {
    tier: "pro",
    label: `Pro · ${status.via === "family" ? "via family" : status.inTrial ? "App Store trial" : source}`,
    until: status.endsAt ? status.endsAt.toISOString() : null,
  };
}

export default async function AdminUsersPage() {
  const [list, costs, viewer] = await Promise.all([accounts(), userCosts(), getViewer()]);
  const pro = await proStatuses(list.map((a) => ({ userId: a.userId, role: a.role })));

  const costById = new Map(costs.map((c) => [c.userId, c]));

  // Serialize to plain values for the client component — Dates and Maps
  // don't cross that boundary, and nothing here carries student content.
  const rows: Row[] = list.map((a) => {
    const c = costById.get(a.userId);
    return {
      userId: a.userId,
      name: a.name,
      email: a.email,
      role: a.role,
      createdAt: a.createdAt.toISOString(),
      lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
      consents: a.consents.map((x) => ({ document: x.document, version: x.version })),
      aiSpend: formatMillicents(c?.aiMillicents ?? 0),
      storage: formatBytes(c?.storageBytes ?? 0),
      plan: planOf(pro.get(a.userId)),
    };
  });

  const missing = rows.filter((r) => r.consents.length === 0).length;

  return (
    <div>
      <SectionLabel className="mb-4">Users</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>{rows.length} accounts</em> on Bearings.
      </TwoTone>

      {missing > 0 && (
        <Card className="p-5 mb-6 border-ink">
          <p className="text-[0.95rem]">
            <strong>
              {missing} account{missing === 1 ? "" : "s"} with no consent record.
            </strong>{" "}
            <span className="text-gray-mid">
              These predate the signup consent flow. New accounts can&apos;t be
              created without one — signup rolls back if the record fails to
              write.
            </span>
          </p>
        </Card>
      )}

      <UsersTable rows={rows} viewerId={viewer?.userId ?? ""} />

      <p className="mt-4 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        &ldquo;Current&rdquo; means the account accepted Terms {TERMS_VERSION} and
        Privacy {PRIVACY_VERSION} — the versions in <code>lib/legal.ts</code>.
        Bumping a version there marks everyone outdated until they accept again.
      </p>
    </div>
  );
}
