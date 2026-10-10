"use client";

import { useState, useTransition } from "react";
import { decideFreeAccessAction } from "@/lib/actions/admin";

export interface AccessRow {
  id: string;
  email: string;
  name: string;
  role: string;
  message: string;
  schoolName: string | null;
  status: "pending" | "approved" | "declined";
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Request({ row }: { row: AccessRow }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function decide(approve: boolean) {
    setMessage(null);
    start(async () => {
      try {
        const r = await decideFreeAccessAction(row.id, { approve, note: note || undefined });
        if (!r.ok) setMessage(r.error);
      } catch (err) {
        console.error("[admin/access] decide failed:", err);
        setMessage("Could not reach the server.");
      }
    });
  }

  return (
    <li className="border border-hairline rounded-xl bg-surface p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <strong>{row.email}</strong>{" "}
          <span className="text-gray-mid text-[0.85rem]">
            {row.name} · {row.role}
            {row.schoolName ? ` · ${row.schoolName}` : ""}
          </span>
        </span>
        <span className="text-[0.8rem] text-gray-mid tabular-nums">{when(row.createdAt)}</span>
      </div>
      <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">{row.message}</p>
      {row.status === "pending" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[0.8rem] text-gray-mid">
            Note <span className="text-gray-mid">(optional — sent if you decline)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="block mt-1 w-80 px-3 py-1.5 border border-hairline rounded-lg bg-surface text-[0.85rem] focus:outline-none focus:border-ink"
            />
          </label>
          <button type="button" disabled={pending} onClick={() => decide(true)} className="px-3.5 py-1.5 rounded-lg bg-ink text-paper text-[0.85rem] disabled:opacity-50">
            Approve — 12 months of Pro
          </button>
          <button type="button" disabled={pending} onClick={() => decide(false)} className="px-3.5 py-1.5 rounded-lg border border-hairline text-[0.85rem] disabled:opacity-50">
            Decline
          </button>
        </div>
      ) : (
        <p className="text-[0.85rem] text-gray-mid">
          {row.status === "approved" ? "Approved" : "Declined"}
          {row.decidedAt ? ` ${when(row.decidedAt)}` : ""}
          {row.decisionNote ? ` — ${row.decisionNote}` : ""}
        </p>
      )}
      {message && <p role="status" className="text-[0.85rem] border-l-2 border-ink pl-3">{message}</p>}
    </li>
  );
}

export default function AccessList({ rows }: { rows: AccessRow[] }) {
  if (rows.length === 0) return <p className="text-gray-mid">No requests yet.</p>;
  const waiting = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");
  return (
    <div className="space-y-8">
      {waiting.length > 0 && <ul className="space-y-4">{waiting.map((r) => <Request key={r.id} row={r} />)}</ul>}
      {decided.length > 0 && (
        <div>
          <h2 className="text-[0.85rem] text-gray-mid mb-3">Decided</h2>
          <ul className="space-y-3">{decided.map((r) => <Request key={r.id} row={r} />)}</ul>
        </div>
      )}
    </div>
  );
}
