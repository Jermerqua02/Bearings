"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { accountHistory, deleteUser, grantPro, revokePro, setUserRole, type AccountEventRow } from "@/lib/actions/admin";
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
  plan: { tier: "free" | "pro"; label: string; until: string | null };
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const ACTION_LABEL: Record<string, string> = {
  "pro.granted": "Pro granted",
  "pro.revoked": "Pro revoked",
};

/**
 * Grant, revoke and history for one account, opened under its row. Every
 * change takes a reason, and every change is in the history.
 */
function PlanPanel({ row, onDone }: { row: Row; onDone: () => void }) {
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<AccountEventRow[] | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await fn();
        setMessage(result.ok ? done : result.error || "That didn't work.");
        if (result.ok) {
          setReason("");
          setUntil("");
          onDone();
        }
        const h = await accountHistory(row.userId);
        if (h.ok) setEvents(h.events);
      } catch (err) {
        console.error("[admin/users] plan action failed:", err);
        setMessage("Could not reach the server.");
      }
    });
  }

  function loadHistory() {
    startTransition(async () => {
      try {
        const h = await accountHistory(row.userId);
        if (h.ok) setEvents(h.events);
        else setMessage(h.error);
      } catch (err) {
        console.error("[admin/users] history failed:", err);
        setMessage("Could not reach the server.");
      }
    });
  }

  const input =
    "px-3 py-1.5 border border-hairline rounded-lg bg-surface text-[0.85rem] focus:outline-none focus:border-ink";

  return (
    <div className="px-4 py-4 bg-paper border-t border-hairline space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[0.8rem] text-gray-mid">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="e.g. beta tester, school pilot"
            className={`${input} block mt-1 w-72`}
          />
        </label>
        <label className="text-[0.8rem] text-gray-mid">
          Pro until <span className="text-gray-mid">(blank: no end)</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${input} block mt-1`} />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => grantPro(row.userId, { until: until || null, reason }), "Pro granted.")}
          className="px-3.5 py-1.5 rounded-lg bg-ink text-paper text-[0.85rem] disabled:opacity-50"
        >
          Grant Pro
        </button>
        {row.plan.tier === "pro" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => revokePro(row.userId, { reason }), "Pro revoked.")}
            className="px-3.5 py-1.5 rounded-lg border border-hairline text-[0.85rem] disabled:opacity-50"
          >
            Revoke Pro
          </button>
        )}
      </div>

      {message && <p role="status" className="text-[0.85rem] border-l-2 border-ink pl-3">{message}</p>}

      <div>
        {events === null ? (
          <button type="button" onClick={loadHistory} disabled={pending} className="text-[0.85rem] text-gray-mid hover:text-ink underline underline-offset-4">
            Show history
          </button>
        ) : events.length === 0 ? (
          <p className="text-[0.85rem] text-gray-mid">No changes to this account yet.</p>
        ) : (
          <ul className="space-y-1.5 text-[0.85rem]">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-3">
                <span className="text-gray-mid tabular-nums">{shortDate(e.at)}</span>
                <span>{ACTION_LABEL[e.action] ?? e.action}{e.endsAt ? ` until ${shortDate(e.endsAt)}` : e.action === "pro.granted" ? ", no end" : ""}</span>
                <span className="text-gray-mid">by {e.actor}</span>
                {e.reason && <span className="text-gray-mid">— {e.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
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
  const [open, setOpen] = useState<string | null>(null);

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
                <th className="font-normal px-4 py-3">Plan</th>
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
                  <td colSpan={8} className="px-4 py-6 text-gray-mid">
                    {rows.length === 0 ? "No accounts yet." : "Nothing matches that search."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const isSelf = r.userId === viewerId;
                return (
                  <Fragment key={r.userId}>
                  <tr className="border-b border-hairline last:border-0">
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setOpen(open === r.userId ? null : r.userId)}
                        className="text-left hover:underline underline-offset-4"
                        aria-expanded={open === r.userId}
                      >
                        <span className={r.plan.tier === "pro" ? "text-ink" : "text-gray-mid"}>{r.plan.label}</span>
                        {r.plan.until && (
                          <span className="block text-[0.8rem] text-gray-mid">until {shortDate(r.plan.until)}</span>
                        )}
                      </button>
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
                  {open === r.userId && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <PlanPanel row={r} onDone={() => {}} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Click a plan to grant or revoke Pro; every change needs a reason and
        goes into the account&apos;s history. Pro is shared across a parent
        link, and an App Store purchase can only be cancelled by Apple or the
        family. Changing a role takes effect on their next request. Deleting removes the
        account and everything belonging to it — essays, lists, conversations —
        and cannot be undone. You can&apos;t delete or demote yourself out of the
        last admin seat.
      </p>
    </div>
  );
}
