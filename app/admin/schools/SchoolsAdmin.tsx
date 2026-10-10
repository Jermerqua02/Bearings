"use client";

import { useState, useTransition } from "react";
import { createLicenseAction, revokeLicenseAction, setLeadStatusAction } from "@/lib/actions/admin";

export interface LeadRow {
  id: string;
  schoolName: string;
  contactName: string;
  role: string | null;
  email: string;
  students: number | null;
  message: string | null;
  source: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface LicenseRow {
  id: string;
  orgName: string;
  contactEmail: string | null;
  code: string;
  seats: number;
  used: number;
  startsAt: string;
  endsAt: string;
  priceCents: number | null;
  invoiceStatus: string;
  revoked: boolean;
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const input = "px-3 py-1.5 border border-hairline rounded-lg bg-surface text-[0.85rem] focus:outline-none focus:border-ink";
const STATUSES = ["new", "contacted", "piloting", "customer", "closed"];

function NewLicense({ leads, onDone }: { leads: LeadRow[]; onDone: (msg: string) => void }) {
  const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ orgName: "", contactEmail: "", seats: "25", endsAt: nextYear, priceDollars: "", invoiceStatus: "pilot", leadId: "", notes: "" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  function fromLead(id: string) {
    const lead = leads.find((l) => l.id === id);
    setF({ ...f, leadId: id, orgName: lead?.schoolName ?? f.orgName, contactEmail: lead?.email ?? f.contactEmail, seats: lead?.students ? String(lead.students) : f.seats });
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const r = await createLicenseAction({ ...f, seats: Number(f.seats), leadId: f.leadId || null });
        if (r.ok) {
          onDone(`License created. Its code is ${r.code} — send it to the school.`);
          setF({ ...f, orgName: "", contactEmail: "", leadId: "", notes: "" });
        } else setError(r.error);
      } catch (err) {
        console.error("[admin/schools] create failed:", err);
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div className="border border-hairline rounded-xl bg-surface p-5 space-y-3">
      <h2 className="font-semibold">New license</h2>
      <div className="flex flex-wrap gap-3">
        {leads.length > 0 && (
          <label className="text-[0.8rem] text-gray-mid">
            From an inquiry
            <select value={f.leadId} onChange={(e) => fromLead(e.target.value)} className={`${input} block mt-1`}>
              <option value="">—</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.schoolName}</option>)}
            </select>
          </label>
        )}
        <label className="text-[0.8rem] text-gray-mid">School or organization<input value={f.orgName} onChange={set("orgName")} className={`${input} block mt-1 w-64`} /></label>
        <label className="text-[0.8rem] text-gray-mid">Contact email<input value={f.contactEmail} onChange={set("contactEmail")} className={`${input} block mt-1 w-56`} /></label>
        <label className="text-[0.8rem] text-gray-mid">Seats<input type="number" min={1} value={f.seats} onChange={set("seats")} className={`${input} block mt-1 w-24`} /></label>
        <label className="text-[0.8rem] text-gray-mid">Ends<input type="date" value={f.endsAt} onChange={set("endsAt")} className={`${input} block mt-1`} /></label>
        <label className="text-[0.8rem] text-gray-mid">$ per seat / yr<input value={f.priceDollars} onChange={set("priceDollars")} placeholder="blank: pilot" className={`${input} block mt-1 w-28`} /></label>
        <label className="text-[0.8rem] text-gray-mid">Invoice
          <select value={f.invoiceStatus} onChange={set("invoiceStatus")} className={`${input} block mt-1`}>
            {["pilot", "invoiced", "paid", "overdue"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="text-[0.8rem] text-gray-mid block">Notes<input value={f.notes} onChange={set("notes")} className={`${input} block mt-1 w-full`} /></label>
      <button type="button" disabled={pending || !f.orgName.trim()} onClick={submit} className="px-3.5 py-1.5 rounded-lg bg-ink text-paper text-[0.85rem] disabled:opacity-50">
        Create license and code
      </button>
      {error && <p role="status" className="text-[0.85rem] border-l-2 border-ink pl-3">{error}</p>}
    </div>
  );
}

export default function SchoolsAdmin({ leads, licenses }: { leads: LeadRow[]; licenses: LicenseRow[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setMessage(null);
    start(async () => {
      try {
        const r = await fn();
        setMessage(r.ok ? done ?? null : r.error ?? "That didn't work.");
      } catch (err) {
        console.error("[admin/schools] action failed:", err);
        setMessage("Could not reach the server.");
      }
    });
  }

  return (
    <div className="space-y-10">
      <NewLicense leads={leads.filter((l) => l.status !== "closed")} onDone={setMessage} />
      {message && <p role="status" className="text-[0.95rem] border-l-2 border-ink pl-3">{message}</p>}

      <section>
        <h2 className="text-[0.85rem] text-gray-mid mb-3">Licenses</h2>
        {licenses.length === 0 ? (
          <p className="text-gray-mid">None yet.</p>
        ) : (
          <div className="border border-hairline rounded-xl bg-surface overflow-x-auto">
            <table className="w-full text-[0.9rem] min-w-[52rem]">
              <thead>
                <tr className="border-b border-hairline text-left text-gray-mid">
                  {["School", "Code", "Seats used", "Dates", "Price / seat", "Invoice", ""].map((h) => <th key={h} className="font-normal px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <tr key={l.id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3">{l.orgName}<span className="block text-[0.8rem] text-gray-mid">{l.contactEmail}</span></td>
                    <td className="px-4 py-3 font-mono">{l.code}</td>
                    <td className="px-4 py-3 tabular-nums">{l.used} of {l.seats}</td>
                    <td className="px-4 py-3 text-gray-mid tabular-nums">{when(l.startsAt)} – {when(l.endsAt)}</td>
                    <td className="px-4 py-3 tabular-nums">{l.priceCents == null ? "pilot" : `$${(l.priceCents / 100).toFixed(2)}`}</td>
                    <td className="px-4 py-3">{l.revoked ? "ended" : l.invoiceStatus}</td>
                    <td className="px-4 py-3 text-right">
                      {l.revoked ? null : ending === l.id ? (
                        <span className="inline-flex gap-3 items-center">
                          <span className="text-[0.8rem] text-gray-mid">End it, and its students&apos; Pro?</span>
                          <button type="button" disabled={pending} onClick={() => { setEnding(null); run(() => revokeLicenseAction(l.id), "License ended."); }} className="text-[0.85rem] underline underline-offset-4">Yes</button>
                          <button type="button" onClick={() => setEnding(null)} className="text-[0.85rem] text-gray-mid">No</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setEnding(l.id)} className="text-[0.85rem] text-gray-mid hover:text-ink">End license</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[0.85rem] text-gray-mid mb-3">Inquiries</h2>
        {leads.length === 0 ? (
          <p className="text-gray-mid">None yet. They arrive from the marketing site&apos;s For schools page and from the app.</p>
        ) : (
          <ul className="space-y-3">
            {leads.map((l) => (
              <li key={l.id} className="border border-hairline rounded-xl bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span><strong>{l.schoolName}</strong> <span className="text-[0.85rem] text-gray-mid">· {l.contactName}{l.role ? `, ${l.role}` : ""} · {l.email}{l.students ? ` · ~${l.students} students` : ""} · from the {l.source}</span></span>
                  <span className="flex items-center gap-3">
                    <span className="text-[0.8rem] text-gray-mid tabular-nums">{when(l.createdAt)}</span>
                    <select value={l.status} disabled={pending} onChange={(e) => run(() => setLeadStatusAction(l.id, e.target.value))} className={input}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </span>
                </div>
                {l.message && <p className="mt-2 text-[0.9rem] whitespace-pre-wrap">{l.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
