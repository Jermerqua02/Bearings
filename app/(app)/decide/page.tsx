"use client";

/* Decision center — where most tools go quiet, we show up.
   Calm by design. No confetti: someone reads this after bad news. */

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { getSchool } from "@/lib/data/schools";
import { useApp } from "@/lib/profile-context";
import type { ListEntry } from "@/lib/types";

type Tab = "tracker" | "aid" | "appeal" | "waitlist" | "choice" | "next-steps";

const outcomeLabel: Record<NonNullable<ListEntry["outcome"]>, string> = {
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  deferred: "Deferred",
  denied: "Not offered admission",
};

/* Deliberately quiet outcome treatment — no green celebration, no red alarm. */
const outcomeTone: Record<NonNullable<ListEntry["outcome"]>, string> = {
  accepted: "text-ink",
  waitlisted: "text-gray-strong",
  deferred: "text-gray-strong",
  denied: "text-gray-mid",
};

function TrackerTab() {
  const { list, updateListEntry } = useApp();
  return (
    <div className="max-w-2xl space-y-3">
      {list.map((e) => {
        const s = getSchool(e.schoolId);
        if (!s) return null;
        return (
          <Card key={e.schoolId} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{s.name}</p>
              {e.outcome && (
                <p className={`text-[0.88rem] ${outcomeTone[e.outcome]}`}>
                  {outcomeLabel[e.outcome]}
                </p>
              )}
            </div>
            <select
              value={e.outcome ?? ""}
              onChange={(ev) =>
                updateListEntry(e.schoolId, {
                  outcome: (ev.target.value || undefined) as ListEntry["outcome"],
                  status: ev.target.value ? "decision" : e.status,
                })
              }
              aria-label={`Outcome for ${s.shortName}`}
              className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
            >
              <option value="">Waiting</option>
              <option value="accepted">Accepted</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="deferred">Deferred</option>
              <option value="denied">Denied</option>
            </select>
          </Card>
        );
      })}
      <p className="text-[0.9rem] text-gray-strong leading-relaxed pt-2">
        A word before the letters arrive: admission decisions at selective
        schools reflect institutional needs as much as student quality. A no is
        not a verdict on you. The list you built has more than one good future
        on it — that was the point of building it this way.
      </p>
    </div>
  );
}

function AidCompareTab() {
  const { list, aidOffers } = useApp();
  const accepted = list.filter((e) => e.outcome === "accepted");
  const rows = accepted
    .map((e) => {
      const s = getSchool(e.schoolId);
      const o = aidOffers.find((x) => x.schoolId === e.schoolId);
      if (!s) return null;
      const coa = o?.coa ?? s.cost.stickerPrice;
      const grants = o?.grants ?? 0;
      const loans = o?.loans ?? 0;
      const work = o?.workStudy ?? 0;
      const trueCost = coa - grants; // what the year actually costs your family
      return { s, coa, grants, loans, work, trueCost };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.trueCost - b.trueCost);

  if (rows.length === 0) {
    return (
      <div className="max-w-2xl">
        <p className="body-copy">
          When acceptances arrive, log award letters in the{" "}
          <Link href="/apply" className="underline underline-offset-2 text-ink">
            aid tracker
          </Link>{" "}
          and this becomes a side-by-side true-cost comparison — the most
          important table of this whole process.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[0.9rem]">
        <thead>
          <tr className="text-left">
            <th className="label-caps font-medium pb-3 pr-4">School</th>
            <th className="label-caps font-medium pb-3 pr-4">Cost of attendance</th>
            <th className="label-caps font-medium pb-3 pr-4">Grants (free money)</th>
            <th className="label-caps font-medium pb-3 pr-4">Loans (you repay)</th>
            <th className="label-caps font-medium pb-3 pr-4">True cost / yr</th>
            <th className="label-caps font-medium pb-3">4-year estimate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.s.id} className="border-t border-hairline">
              <td className="py-3 pr-4 font-medium">
                {r.s.shortName}
                {i === 0 && (
                  <span className="block text-[0.72rem] uppercase tracking-[0.08em] text-accent">
                    Lowest true cost
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">${r.coa.toLocaleString()}</td>
              <td className="py-3 pr-4">−${r.grants.toLocaleString()}</td>
              <td className="py-3 pr-4 text-gray-strong">${r.loans.toLocaleString()}</td>
              <td className="py-3 pr-4 font-semibold">${r.trueCost.toLocaleString()}</td>
              <td className="py-3">~${(r.trueCost * 4).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.85rem] text-gray-mid mt-4 max-w-2xl">
        True cost = cost of attendance minus grants and scholarships. Loans
        aren&apos;t aid — they&apos;re a payment plan with interest, so we
        don&apos;t subtract them. Work-study is earned during the year.
      </p>
    </div>
  );
}

function AppealTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="body-copy space-y-3">
        <p>
          <span className="text-ink font-medium">When appealing makes sense:</span>{" "}
          your family&apos;s finances changed since you filed (job loss, medical
          costs, a sibling starting college), the forms missed something real, or
          another comparable school offered meaningfully more. Colleges expect
          these letters; the process even has a name — &quot;professional
          judgment review.&quot;
        </p>
        <p>
          <span className="text-ink font-medium">When it doesn&apos;t:</span>{" "}
          the numbers are accurate and you simply wish they were different, or
          you&apos;re comparing against a school with a different aid policy.
          An appeal without new information rarely moves anything.
        </p>
      </div>
      <Card className="p-6">
        <SectionLabel className="mb-4">The shape of a good appeal letter</SectionLabel>
        <ol className="space-y-3 text-[0.95rem] leading-relaxed list-none">
          {[
            "Thank the aid office and say clearly that the student wants to attend.",
            "State the new information plainly, with numbers and dates — job change, medical expense, competing offer (attach documentation).",
            "Make a specific, reasonable request: \"an additional $4,000 in grant aid would make this possible for our family.\"",
            "Close warmly. Aid officers are people who chose this work; entitlement reads badly, honesty reads well.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="card-index pt-0.5">{String(i + 1).padStart(2, "0")}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-[0.9rem] text-gray-strong">
        Want help? Open the{" "}
        <Link href="/counselor" className="underline underline-offset-2 text-ink">
          counselor
        </Link>{" "}
        — I&apos;ll ask about your situation and help you organize the letter.
        (You write it; I&apos;ll ask the right questions.)
      </p>
    </div>
  );
}

function WaitlistTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="body-copy space-y-3">
        <p>
          Honest framing first: at selective schools, waitlist admission rates
          are usually in the single digits, and some years a waitlist takes no
          one. Hope is fine — a plan that depends on it is not. Put your deposit
          down somewhere you&apos;d be happy, then let the waitlist be a bonus.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionLabel className="mb-3 !text-target">What actually helps</SectionLabel>
          <ul className="space-y-2 text-[0.9rem] leading-relaxed">
            <li>— One letter of continued interest (LOCI): short, specific, new information only.</li>
            <li>— A genuinely new development: an award, a grade trend, a completed project.</li>
            <li>— Saying clearly you&apos;ll attend if admitted (only if true).</li>
            <li>— Responding fast if they call — waitlist offers move quickly.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-3">What&apos;s noise</SectionLabel>
          <ul className="space-y-2 text-[0.9rem] leading-relaxed text-gray-strong">
            <li>— Weekly emails. One LOCI. Maybe one update. That&apos;s it.</li>
            <li>— Extra recommendation letters they didn&apos;t ask for.</li>
            <li>— Campus visits to &quot;show interest&quot; post-decision.</li>
            <li>— Parents calling the admissions office. Ever.</li>
          </ul>
        </Card>
      </div>
      <Card className="p-6">
        <SectionLabel className="mb-3">LOCI structure</SectionLabel>
        <p className="text-[0.95rem] leading-relaxed">
          Three short paragraphs: (1) you remain enthusiastic and will attend if
          admitted, (2) what&apos;s new since you applied — concrete, not
          padded, (3) a thank-you. Under 300 words. Bring me a draft and
          I&apos;ll ask the questions that tighten it.
        </p>
      </Card>
    </div>
  );
}

function ChoiceTab() {
  const { list, aidOffers } = useApp();
  const accepted = list.filter((e) => e.outcome === "accepted");
  const [gut, setGut] = useState<Record<string, string>>({});

  if (accepted.length === 0) {
    return (
      <p className="body-copy">
        Once acceptances are in, this worksheet puts cost, fit, outcomes, and
        gut feel side by side — one screen for the decision your family makes
        together. A parent can see this page; it&apos;s built for the kitchen
        table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <p className="text-[0.9rem] text-gray-strong mb-4 max-w-2xl">
        This page is meant to be looked at together — it&apos;s in the shared
        view a linked parent can see. Cost and outcomes are facts; fit and gut
        feel belong to the student. All four matter.
      </p>
      <table className="w-full min-w-[560px] text-[0.9rem]">
        <thead>
          <tr className="text-left">
            <th className="label-caps font-medium pb-3 pr-4">School</th>
            <th className="label-caps font-medium pb-3 pr-4">True cost / yr</th>
            <th className="label-caps font-medium pb-3 pr-4">Grad rate</th>
            <th className="label-caps font-medium pb-3 pr-4">Median earnings</th>
            <th className="label-caps font-medium pb-3">Gut feel (yours)</th>
          </tr>
        </thead>
        <tbody>
          {accepted.map((e) => {
            const s = getSchool(e.schoolId);
            if (!s) return null;
            const o = aidOffers.find((x) => x.schoolId === s.id);
            const trueCost = (o?.coa ?? s.cost.stickerPrice) - (o?.grants ?? 0);
            return (
              <tr key={s.id} className="border-t border-hairline">
                <td className="py-3 pr-4 font-medium">{s.shortName}</td>
                <td className="py-3 pr-4">${trueCost.toLocaleString()}</td>
                <td className="py-3 pr-4">{Math.round(s.outcomes.gradRate * 100)}%</td>
                <td className="py-3 pr-4">${s.outcomes.medianEarnings10yr.toLocaleString()}</td>
                <td className="py-3">
                  <input
                    value={gut[s.id] ?? ""}
                    onChange={(ev) => setGut((p) => ({ ...p, [s.id]: ev.target.value }))}
                    placeholder="How does it feel?"
                    aria-label={`Gut feel about ${s.shortName}`}
                    className="border-b border-hairline bg-transparent focus:border-ink outline-none w-full max-w-[180px]"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NextStepsTab() {
  const [done, setDone] = useState<Set<number>>(new Set());
  const steps = [
    "Choose one school and submit the enrollment deposit by May 1 (National Decision Day).",
    "Decline your other offers — it's courteous, and it frees waitlist spots for other students.",
    "Accept or decline each piece of the aid package separately (you can take the grant and skip the loan).",
    "Complete loan counseling and sign the MPN only for loans you're actually using.",
    "Send your final transcript — admission is contingent on finishing well.",
    "Register for orientation and housing before the good slots go.",
    "Thank the people who wrote your recommendations. Tell them where you landed — they genuinely want to know.",
  ];
  return (
    <div className="max-w-2xl">
      <ul className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i}>
            <button
              onClick={() =>
                setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className="flex gap-3 text-left w-full group"
            >
              <span
                aria-hidden
                className={`mt-1 w-4 h-4 shrink-0 rounded-[2px] border transition-quiet ${
                  done.has(i) ? "bg-ink border-ink" : "border-gray-mid group-hover:border-ink"
                }`}
              />
              <span
                className={`text-[0.95rem] leading-relaxed ${
                  done.has(i) ? "text-gray-mid line-through" : ""
                }`}
              >
                {s}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DecidePage() {
  const [tab, setTab] = useState<Tab>("tracker");
  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionLabel className="mb-3">Decisions</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>The choice</em> your family makes together.
        </TwoTone>
      </div>
      <div
        role="tablist"
        aria-label="Decision sections"
        className="flex gap-1 overflow-x-auto no-scrollbar border-b border-hairline mb-8"
      >
        {(
          [
            ["tracker", "Decisions"],
            ["aid", "Compare offers"],
            ["appeal", "Aid appeals"],
            ["waitlist", "Waitlist & deferral"],
            ["choice", "Final choice"],
            ["next-steps", "Through May 1"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[0.88rem] whitespace-nowrap border-b-2 -mb-px transition-quiet ${
              tab === id
                ? "border-ink text-ink font-medium"
                : "border-transparent text-gray-mid hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "tracker" && <TrackerTab />}
      {tab === "aid" && <AidCompareTab />}
      {tab === "appeal" && <AppealTab />}
      {tab === "waitlist" && <WaitlistTab />}
      {tab === "choice" && <ChoiceTab />}
      {tab === "next-steps" && <NextStepsTab />}
    </div>
  );
}
