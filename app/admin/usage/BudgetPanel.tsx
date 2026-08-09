"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import { saveBudget } from "@/lib/actions/admin";
import { formatUsd } from "@/lib/format";

/* Budget and alerts.

   The gauge reads month-to-date all-in spend against the budget. Thresholds
   are percentages — 80 and 100 by default — and are stored rather than
   hard-coded because what counts as "too much" is a decision, not a rate. */

export default function BudgetPanel({
  monthlyBudgetUsd,
  alertThresholds,
  alertEmail,
  alertsEnabled,
  spentUsd,
  lastAlert,
  adminEmails,
}: {
  monthlyBudgetUsd: number;
  alertThresholds: number[];
  alertEmail: string;
  alertsEnabled: boolean;
  spentUsd: number;
  lastAlert: string | null;
  adminEmails: string[];
}) {
  const [budget, setBudget] = useState(String(monthlyBudgetUsd));
  const [thresholds, setThresholds] = useState(alertThresholds.join(", "));
  const [email, setEmail] = useState(alertEmail);
  const [enabled, setEnabled] = useState(alertsEnabled);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const budgetNum = Number(budget) || 0;
  const usedPct = budgetNum > 0 ? Math.min(100, (spentUsd / budgetNum) * 100) : 0;
  // Over budget is the one place this UI raises its voice.
  const over = budgetNum > 0 && spentUsd > budgetNum;

  async function onSave() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await saveBudget({
        monthlyBudgetUsd: budgetNum,
        alertThresholds: thresholds
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n)),
        alertEmail: email,
        alertsEnabled: enabled,
      });
      if (!result.ok) setError(result.error || "Could not save.");
      else setNote("Saved.");
    } catch (err) {
      console.error("[budget] save failed:", err);
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const recipients = email.trim() || adminEmails.join(", ") || "no admins on file";

  return (
    <Card className={`p-5 mb-8 ${over ? "border-ink" : ""}`}>
      <SectionLabel className="mb-4">Budget &amp; alerts</SectionLabel>

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="text-[1.6rem] font-semibold tracking-tight tabular-nums">
          {formatUsd(spentUsd)}
        </p>
        <p className="text-[0.9rem] text-gray-mid">
          of ${budgetNum.toFixed(2)} this month ({Math.round(usedPct)}%)
        </p>
      </div>
      <div className="h-2 rounded-full bg-fill overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-ink transition-quiet"
          style={{ width: `${Math.max(usedPct, spentUsd > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <p className="text-[0.85rem] text-gray-mid mb-6">
        {over && <strong className="text-ink">Over budget. </strong>}
        {lastAlert ? `Last alert ${lastAlert}.` : "No alerts sent this month."} ·
        Recipients: {recipients}
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label className="flex flex-col gap-2">
          <span className="text-[0.85rem] text-gray-strong">Monthly budget ($)</span>
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="px-3 py-2.5 border border-hairline rounded-lg bg-paper text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[0.85rem] text-gray-strong">Alert thresholds (%)</span>
          <input
            value={thresholds}
            onChange={(e) => setThresholds(e.target.value)}
            placeholder="80, 100"
            className="px-3 py-2.5 border border-hairline rounded-lg bg-paper text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[0.85rem] text-gray-strong">
            Alert email <span className="text-gray-mid">(blank = all admins)</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2.5 border border-hairline rounded-lg bg-paper text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
          />
        </label>
        <label className="flex items-center gap-2.5 sm:self-end sm:pb-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-ink cursor-pointer"
          />
          <span className="text-[0.9rem]">Alerts enabled</span>
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-ink text-paper text-[0.9rem] disabled:opacity-50 transition-quiet"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {note && <span className="text-[0.85rem] text-gray-mid">{note}</span>}
        {error && (
          <span role="alert" className="text-[0.85rem] border-l-2 border-ink pl-2">
            {error}
          </span>
        )}
      </div>

      <p className="text-[0.8rem] text-gray-mid mt-4 leading-relaxed">
        Thresholds are recorded and shown here. Sending the email needs a mail
        provider, which isn&apos;t wired yet — see the APIs tab.
      </p>
    </Card>
  );
}
