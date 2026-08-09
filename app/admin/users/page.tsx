import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { accounts } from "@/lib/db/queries/admin";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Users · Northstar admin" };

export const dynamic = "force-dynamic";

/* The account roster.

   Status only — no student content is loaded. Consent is shown because an
   account without a recorded agreement is something you want to be able to
   find, not something to discover in a dispute. */

function ConsentCell({
  consents,
}: {
  consents: Array<{ document: string; version: string }>;
}) {
  const has = (doc: string, version: string) =>
    consents.some((c) => c.document === doc && c.version === version);

  const terms = has("terms", TERMS_VERSION);
  const privacy = has("privacy", PRIVACY_VERSION);

  if (terms && privacy) {
    return <span className="text-gray-mid">Current</span>;
  }
  if (consents.length === 0) {
    return (
      <span className="text-ink font-medium" title="Created before the consent flow existed">
        None on file
      </span>
    );
  }
  return (
    <span className="text-ink" title="Accepted an older version">
      Outdated{!terms && " · terms"}
      {!privacy && " · privacy"}
    </span>
  );
}

export default async function AdminUsersPage() {
  const rows = await accounts();

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const ago = (d: Date | null) =>
    d === null ? "never" : `${Math.floor((Date.now() - d.getTime()) / 86_400_000)}d ago`;

  const missing = rows.filter((r) => r.consents.length === 0).length;

  return (
    <div>
      <SectionLabel className="mb-4">Users</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>{rows.length} accounts</em> on Northstar.
      </TwoTone>

      {missing > 0 && (
        <Card className="p-5 mb-6 border-ink">
          <p className="text-[0.95rem]">
            <strong>
              {missing} account{missing === 1 ? "" : "s"} with no consent record.
            </strong>{" "}
            <span className="text-gray-mid">
              These predate the signup consent flow. New accounts cannot be
              created without one — signup rolls back if the record fails to
              write. Ask these users to re-accept at next sign-in if the
              agreement matters for them.
            </span>
          </p>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.9rem] min-w-[44rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-5 py-3">Account</th>
                <th className="font-normal px-5 py-3">Role</th>
                <th className="font-normal px-5 py-3">Joined</th>
                <th className="font-normal px-5 py-3">Last seen</th>
                <th className="font-normal px-5 py-3">Terms</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-gray-mid">
                    No accounts yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3">
                    <span className="block">{r.email}</span>
                    <span className="text-[0.8rem] text-gray-mid">{r.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        r.role === "admin"
                          ? "px-2 py-0.5 rounded border border-ink text-[0.8rem]"
                          : "text-gray-mid"
                      }
                    >
                      {r.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-mid tabular-nums">{fmt(r.createdAt)}</td>
                  <td className="px-5 py-3 text-gray-mid tabular-nums">{ago(r.lastSeenAt)}</td>
                  <td className="px-5 py-3">
                    <ConsentCell consents={r.consents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Current means the account has accepted Terms {TERMS_VERSION} and Privacy{" "}
        {PRIVACY_VERSION} — the versions in <code>lib/legal.ts</code>. Bumping a
        version there marks everyone outdated until they accept again.
      </p>
    </div>
  );
}
