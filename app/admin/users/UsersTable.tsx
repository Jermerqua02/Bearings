"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteUser, setUserRole } from "@/lib/actions/admin";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

/* The user table.

   Client-side because of search and the row actions. The rows arrive
   already stripped to administrative fields by lib/db/queries/admin.ts —
   no student content is serialized to the browser to be filtered here. */

export interface Row {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastSeenAt: string | null;
  consents: Array<{ document: string; version: string }>;
  aiSpend: string;
  storage: string;
}

function Consent({ consents }: { consents: Row["consents"] }) {
  const has = (d: string, v: string) =>
    consents.some((c) => c.document === d && c.version === v);
  const terms = has("terms", TERMS_VERSION);
  const privacy = has("privacy", PRIVACY_VERSION);

  if (terms && privacy) return <span className="text-gray-mid">Current</span>;
  if (consents.length === 0)
    return (
      <span className="text-ink" title="Created before the consent flow existed">
        None
      </span>
    );
  return (
    <span className="text-ink" title="Accepted an older version">
      Outdated
    </span>
  );
}

export default function UsersTable({
  rows,
  viewerId,
}: {
  rows: Row[];
  viewerId: string;
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) setError(result.error || "That didn't work.");
      } catch (err) {
        console.error("[admin/users] action failed:", err);
        setError("Could not reach the server.");
      }
    });
  }

  const days = (iso: string | null) =>
    iso === null ? "never" : `${Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)}d`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span className="text-[0.85rem] text-gray-mid">
          {filtered.length} of {rows.length} shown
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name…"
          className="px-3.5 py-2 border border-hairline rounded-lg bg-surface text-[0.9rem] w-full sm:w-72 focus:outline-none focus:border-ink transition-quiet"
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 text-[0.9rem] border-l-2 border-ink pl-3">
          {error}
        </p>
      )}

      <div className="border border-hairline rounded-xl bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.9rem] min-w-[58rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-4 py-3">Account</th>
                <th className="font-normal px-4 py-3">Role</th>
                <th className="font-normal px-4 py-3">Joined</th>
                <th className="font-normal px-4 py-3">Seen</th>
                <th className="font-normal px-4 py-3">Terms</th>
                <th className="font-normal px-4 py-3 text-right">AI</th>
                <th className="font-normal px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-gray-mid">
                    {rows.length === 0 ? "No accounts yet." : "Nothing matches that search."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const isSelf = r.userId === viewerId;
                return (
                  <tr key={r.userId} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3">
                      <span className="block">{r.email}</span>
                      <span className="text-[0.8rem] text-gray-mid">
                        {r.name}
                        {isSelf && " · you"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.role}
                        disabled={pending}
                        onChange={(e) => run(() => setUserRole(r.userId, e.target.value))}
                        className="px-2 py-1 border border-hairline rounded bg-paper text-[0.85rem] focus:outline-none focus:border-ink"
                      >
                        <option value="student">student</option>
                        <option value="parent">parent</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-mid tabular-nums">
                      {new Date(r.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-mid tabular-nums">{days(r.lastSeenAt)}</td>
                    <td className="px-4 py-3">
                      <Consent consents={r.consents} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-mid">
                      {r.aiSpend}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-[0.85rem] text-gray-mid">—</span>
                      ) : confirming === r.userId ? (
                        <span className="inline-flex items-center gap-3">
                          <span className="text-[0.8rem] text-gray-mid">Delete everything?</span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              setConfirming(null);
                              run(() => deleteUser(r.userId));
                            }}
                            className="text-[0.85rem] text-ink underline underline-offset-4"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="text-[0.85rem] text-gray-mid hover:text-ink"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirming(r.userId)}
                          className="text-[0.85rem] text-gray-mid hover:text-ink transition-quiet"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Changing a role takes effect on their next request. Deleting removes the
        account and everything belonging to it — essays, lists, conversations —
        and cannot be undone. You can&apos;t delete or demote yourself out of the
        last admin seat.
      </p>
    </div>
  );
}
