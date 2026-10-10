"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  accountHistory,
  changeGrantAction,
  deleteUser,
  endGrantAction,
  grantPro,
  proDetailAction,
  removeProAction,
  restoreProAction,
  setUserRole,
  type AccountEventRow,
} from "@/lib/actions/admin";
import type { GrantRow, ProDetail } from "@/lib/pro-admin";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

/* The user table.

   Client-side because of search and the Manage window. The rows arrive
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
  plan: { tier: "free" | "pro"; label: string; until: string | null; removed: boolean };
}

type Result = { ok: boolean; error?: string };

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** An ISO time as the date input's value — dates here are UTC, like the server's. */
const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const SOURCE_LABEL: Record<string, string> = {
  app_store: "App Store",
  admin: "Granted",
  free_access: "Free access",
  school: "School",
  staff: "Staff",
};

const ACTION_LABEL: Record<string, string> = {
  "pro.granted": "Pro granted",
  "pro.changed": "Grant changed",
  "pro.revoked": "Grant ended",
  "pro.removed": "Pro removed",
  "pro.restored": "Pro restored",
  "pro.school_code": "School code used",
  "free_access.declined": "Free access declined",
};

const input =
  "px-3 py-1.5 border border-hairline rounded-lg bg-surface text-[0.85rem] focus:outline-none focus:border-ink";
const primary = "px-3.5 py-1.5 rounded-lg bg-ink text-paper text-[0.85rem] disabled:opacity-50";
const secondary = "px-3.5 py-1.5 rounded-lg border border-hairline bg-surface text-[0.85rem] hover:border-ink disabled:opacity-50";
const quiet = "text-[0.85rem] text-gray-mid hover:text-ink underline underline-offset-4 disabled:opacity-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 border-t border-hairline first:border-t-0 first:pt-0">
      <h3 className="text-[0.75rem] uppercase tracking-[0.08em] text-gray-mid mb-3">{title}</h3>
      {children}
    </section>
  );
}

/** One grant: its dates, editable in place when Lumni can change it. */
function GrantLine({ g, busy, act }: { g: GrantRow; busy: boolean; act: (fn: () => Promise<Result>, done: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [from, setFrom] = useState(dayOf(g.startsAt));
  const [until, setUntil] = useState(dayOf(g.endsAt));
  const live = g.state === "active" || g.state === "scheduled";

  return (
    <li className={`py-3 border-b border-hairline last:border-0 ${live ? "" : "text-gray-mid"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-ink">
          {SOURCE_LABEL[g.source] ?? g.source}
          {g.inTrial && " (trial)"}
        </span>
        <span className="tabular-nums">
          {shortDate(g.startsAt)} – {g.endsAt ? shortDate(g.endsAt) : "no end"}
        </span>
        <span
          className={`text-[0.75rem] px-2 py-0.5 rounded-full ${
            g.state === "active" ? "bg-ink text-paper" : "bg-fill text-gray-strong"
          }`}
        >
          {g.state === "revoked" && g.revokedAt ? `ended ${shortDate(g.revokedAt)}` : g.state}
        </span>
        {g.note && <span className="text-[0.8rem] text-gray-mid">— {g.note}</span>}
      </div>

      {g.source === "app_store" && live && (
        <p className="mt-1 text-[0.8rem] text-gray-mid">
          Paid through Apple — only Apple or the family can cancel or refund it. Remove Pro stops it counting.
        </p>
      )}

      {g.editable && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <button type="button" className={quiet} disabled={busy} onClick={() => setEditing(true)}>
            Change dates
          </button>
          {confirmEnd ? (
            <span className="inline-flex items-center gap-3 text-[0.85rem]">
              End this grant today?
              <button
                type="button"
                className="underline underline-offset-4 text-ink"
                disabled={busy}
                onClick={() => {
                  setConfirmEnd(false);
                  act(() => endGrantAction(g.id, {}), "Grant ended.");
                }}
              >
                Yes, end it
              </button>
              <button type="button" className="text-gray-mid hover:text-ink" onClick={() => setConfirmEnd(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className={quiet} disabled={busy} onClick={() => setConfirmEnd(true)}>
              End now
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-[0.8rem] text-gray-mid">
            Starts
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={g.state !== "scheduled"}
              title={g.state === "scheduled" ? undefined : "Already started"}
              className={`${input} block mt-1 disabled:opacity-60`}
            />
          </label>
          <label className="text-[0.8rem] text-gray-mid">
            Ends <span>(blank: no end)</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${input} block mt-1`} />
          </label>
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() => {
              act(
                () => changeGrantAction(g.id, { from: g.state === "scheduled" ? from || null : undefined, until: until || null }),
                "Dates changed.",
              );
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className={secondary}
            onClick={() => {
              setEditing(false);
              setFrom(dayOf(g.startsAt));
              setUntil(dayOf(g.endsAt));
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Everything an admin can do to one account: Pro (see, give, change, end,
 * remove, restore), the role, the history, and deleting it.
 */
function ManageDialog({ row, isSelf, onClose }: { row: Row; isSelf: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<ProDetail | null>(null);
  const [events, setEvents] = useState<AccountEventRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function reload() {
    const [d, h] = await Promise.all([proDetailAction(row.userId), accountHistory(row.userId)]);
    if (d.ok) setDetail(d.detail);
    else setMessage(d.error);
    if (h.ok) setEvents(h.events);
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        await reload();
      } catch (err) {
        console.error("[admin/users] load failed:", err);
        setMessage("Could not reach the server.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.userId]);

  function act(fn: () => Promise<Result>, done: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await fn();
        setMessage(result.ok ? done : result.error || "That didn't work.");
        if (result.ok) {
          setNote("");
          after?.();
        }
        await reload();
      } catch (err) {
        console.error("[admin/users] action failed:", err);
        setMessage("Could not reach the server.");
      }
    });
  }

  const n = () => note.trim() || null;
  const staff = (detail?.role ?? row.role) === "admin";
  const status = detail?.status;
  const live = detail?.grants.filter((g) => g.state === "active" || g.state === "scheduled") ?? [];
  const past = detail?.grants.filter((g) => !(g.state === "active" || g.state === "scheduled")) ?? [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] rounded-2xl bg-surface text-ink p-0 shadow-xl backdrop:bg-ink/40"
    >
      <div className="sticky top-0 z-10 bg-surface border-b border-hairline px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[1.1rem] font-medium">{row.email}</h2>
          <p className="text-[0.85rem] text-gray-mid">
            {row.name}
            {isSelf && " · you"} · {row.role} · joined {shortDate(row.createdAt)}
          </p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="text-gray-mid hover:text-ink text-xl leading-none px-1">
          ×
        </button>
      </div>

      <div className="px-6 py-5">
        {message && (
          <p role="status" className="mb-5 text-[0.9rem] border-l-2 border-ink pl-3">
            {message}
          </p>
        )}

        <Section title="Pro">
          {!detail ? (
            <p className="text-[0.9rem] text-gray-mid">Loading…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-[1rem]">
                {detail.block ? (
                  <>
                    <strong>Pro removed</strong>
                    <span className="text-gray-mid">
                      {" "}
                      on {shortDate(detail.block.at)}
                      {detail.block.by && ` by ${detail.block.by}`}
                      {detail.block.reason && ` — ${detail.block.reason}`}
                    </span>
                  </>
                ) : status?.tier === "pro" ? (
                  <>
                    <strong>Pro</strong>
                    <span className="text-gray-mid">
                      {" "}
                      · {status.via === "family" ? "shared from a linked account" : SOURCE_LABEL[status.source] ?? status.source}
                      {status.inTrial && " (trial)"}
                      {status.endsAt ? `, until ${shortDate(status.endsAt)}` : ", no end"}
                    </span>
                  </>
                ) : (
                  <strong>Free</strong>
                )}
              </p>

              {detail.family.length > 0 && (
                <p className="text-[0.85rem] text-gray-mid">
                  Linked to{" "}
                  {detail.family.map((f, i) => (
                    <span key={f.email}>
                      {i > 0 && ", "}
                      {f.email} ({f.role}, {f.pro ? "Pro" : "Free"})
                    </span>
                  ))}
                  . Pro is shared across the link.
                </p>
              )}

              {staff ? (
                <p className="text-[0.85rem] text-gray-mid">Admins have Pro by role. Change the role to manage their Pro.</p>
              ) : (
                <>
                  <label className="block text-[0.8rem] text-gray-mid">
                    Note for the history <span>(optional)</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={300}
                      placeholder="e.g. beta tester, school pilot, abuse report"
                      className={`${input} block mt-1 w-full`}
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    {detail.block ? (
                      <button
                        type="button"
                        className={primary}
                        disabled={busy}
                        onClick={() => act(() => restoreProAction(row.userId, { note: n() }), "Pro restored. Any Pro they'd otherwise have counts again.")}
                      >
                        Restore Pro
                      </button>
                    ) : confirming === "remove" ? (
                      <span className="inline-flex flex-wrap items-center gap-3 text-[0.9rem]">
                        Remove Pro from this account?
                        <button
                          type="button"
                          className={primary}
                          disabled={busy}
                          onClick={() => {
                            setConfirming(null);
                            act(async () => {
                              const r = await removeProAction(row.userId, { note: n() });
                              if (r.ok && r.appStoreActive) {
                                return {
                                  ok: false,
                                  error:
                                    "Pro removed. They still have an App Store subscription running — Apple keeps charging until they cancel, and only Apple can refund it.",
                                };
                              }
                              return r;
                            }, "Pro removed. Nothing gives this account Pro until you restore it or grant it again.");
                          }}
                        >
                          Yes, remove Pro
                        </button>
                        <button type="button" className={secondary} onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming("remove")}>
                        Remove Pro
                      </button>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-gray-mid">
                    {detail.block
                      ? "Restoring lets any Pro they'd otherwise have count again — a linked account's, an App Store purchase. Grants that were ended stay ended."
                      : "Removing ends every grant below and blocks Pro from any source — a linked account, an App Store purchase — until you restore it or give Pro again."}
                  </p>
                </>
              )}
            </div>
          )}
        </Section>

        {detail && !staff && (
          <Section title="Give Pro">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[0.8rem] text-gray-mid">
                Starts <span>(blank: today)</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} block mt-1`} />
              </label>
              <label className="text-[0.8rem] text-gray-mid">
                Ends <span>(blank: no end)</span>
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${input} block mt-1`} />
              </label>
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() =>
                  act(
                    () => grantPro(row.userId, { from: from || null, until: until || null, note: n() }),
                    detail.block ? "Pro granted, and the removal lifted." : "Pro granted.",
                    () => {
                      setFrom("");
                      setUntil("");
                    },
                  )
                }
              >
                Give Pro
              </button>
            </div>
            {detail.block && <p className="mt-2 text-[0.8rem] text-gray-mid">Giving Pro also lifts the removal.</p>}
          </Section>
        )}

        {detail && (
          <Section title={`Grants${detail.grants.length ? ` (${detail.grants.length})` : ""}`}>
            {detail.grants.length === 0 ? (
              <p className="text-[0.9rem] text-gray-mid">None — this account has never had Pro of its own.</p>
            ) : (
              <ul className="text-[0.9rem]">
                {[...live, ...past].map((g) => (
                  <GrantLine key={g.id} g={g} busy={busy} act={act} />
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Role">
          <div className="flex items-center gap-3">
            <select
              defaultValue={row.role}
              disabled={busy}
              onChange={(e) => act(() => setUserRole(row.userId, e.target.value), `Role changed to ${e.target.value}.`)}
              className="px-2 py-1.5 border border-hairline rounded-lg bg-paper text-[0.85rem] focus:outline-none focus:border-ink"
            >
              <option value="student">student</option>
              <option value="parent">parent</option>
              <option value="admin">admin</option>
            </select>
            <span className="text-[0.8rem] text-gray-mid">Takes effect on their next request.</span>
          </div>
        </Section>

        <Section title="History">
          {events === null ? (
            <p className="text-[0.9rem] text-gray-mid">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-[0.9rem] text-gray-mid">No changes to this account yet.</p>
          ) : (
            <ul className="space-y-1.5 text-[0.85rem]">
              {events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-3">
                  <span className="text-gray-mid tabular-nums">{shortDate(e.at)}</span>
                  <span>
                    {ACTION_LABEL[e.action] ?? e.action}
                    {(e.action === "pro.granted" || e.action === "pro.changed") &&
                      (e.endsAt ? ` until ${shortDate(e.endsAt)}` : ", no end")}
                    {e.action === "pro.granted" && e.startsAt && new Date(e.startsAt) > new Date(e.at) && `, from ${shortDate(e.startsAt)}`}
                  </span>
                  <span className="text-gray-mid">by {e.actor}</span>
                  {e.reason && <span className="text-gray-mid">— {e.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {!isSelf && (
          <Section title="Delete account">
            {confirming === "delete" ? (
              <span className="inline-flex flex-wrap items-center gap-3 text-[0.9rem]">
                Delete {row.email} and everything belonging to it? This can&apos;t be undone.
                <button
                  type="button"
                  className={primary}
                  disabled={busy}
                  onClick={() =>
                    act(() => deleteUser(row.userId), "Deleted.", () => ref.current?.close())
                  }
                >
                  Yes, delete
                </button>
                <button type="button" className={secondary} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming("delete")}>
                  Delete account
                </button>
                <span className="text-[0.8rem] text-gray-mid">Removes essays, lists and conversations for good.</span>
              </div>
            )}
          </Section>
        )}
      </div>
    </dialog>
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
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const days = (iso: string | null) =>
    iso === null ? "never" : `${Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)}d`;

  const managing = rows.find((r) => r.userId === open);

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

      <div className="border border-hairline rounded-xl bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.9rem] min-w-[52rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-4 py-3">Account</th>
                <th className="font-normal px-4 py-3">Role</th>
                <th className="font-normal px-4 py-3">Plan</th>
                <th className="font-normal px-4 py-3">Joined</th>
                <th className="font-normal px-4 py-3">Seen</th>
                <th className="font-normal px-4 py-3">Terms</th>
                <th className="font-normal px-4 py-3 text-right">AI</th>
                <th className="font-normal px-4 py-3 text-right" aria-label="Manage" />
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
              {filtered.map((r) => (
                <tr key={r.userId} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">
                    <span className="block">{r.email}</span>
                    <span className="text-[0.8rem] text-gray-mid">
                      {r.name}
                      {r.userId === viewerId && " · you"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-strong">{r.role}</td>
                  <td className="px-4 py-3">
                    <span className={r.plan.tier === "pro" ? "text-ink" : "text-gray-mid"}>{r.plan.label}</span>
                    {r.plan.until && (
                      <span className="block text-[0.8rem] text-gray-mid">until {shortDate(r.plan.until)}</span>
                    )}
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
                  <td className="px-4 py-3 text-right tabular-nums text-gray-mid">{r.aiSpend}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setOpen(r.userId)} className={secondary}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {managing && (
        <ManageDialog key={managing.userId} row={managing} isSelf={managing.userId === viewerId} onClose={() => setOpen(null)} />
      )}

      <p className="mt-6 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Manage an account to give, change, end or remove its Pro, change its
        role, see its history, or delete it. Every change goes into the
        account&apos;s history. Pro is shared across a parent link; an App
        Store purchase can only be cancelled or refunded by Apple or the
        family, but Remove Pro stops it counting. You can&apos;t delete
        yourself or demote the last admin.
      </p>
    </div>
  );
}
