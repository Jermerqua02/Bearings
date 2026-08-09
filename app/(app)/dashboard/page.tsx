"use client";

/* Dashboard — different for student vs. parent.
   The weekly check-in is the mechanic that turns a tool into a relationship. */

import { useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import TwoTone from "@/components/ui/TwoTone";
import { getSchool } from "@/lib/data/schools";
import { daysUntil, listBalance, nextDeadline } from "@/lib/match";
import { useApp } from "@/lib/profile-context";
import { gradeModeLabel, type ParentProfile, type StudentProfile } from "@/lib/types";

/* ————— Weekly check-in ————— */

function CheckInCard() {
  const { checkIns, dismissCheckIn, toggleCheckInAction } = useApp();
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = checkIns.find((c) => !c.dismissed);
  const history = checkIns.filter((c) => c.dismissed);

  return (
    <>
      {current && (
        <Card className="p-6 border-accent/30 bg-accent-soft">
          <div className="flex items-start justify-between gap-3 mb-4">
            <SectionLabel className="!text-accent">
              This week — three things, that&apos;s all
            </SectionLabel>
            <button
              onClick={() => dismissCheckIn(current.id)}
              className="text-[0.8rem] text-gray-mid hover:text-ink transition-quiet"
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-3">
            {current.actions.map((a, i) => (
              <li key={i}>
                <button
                  onClick={() => toggleCheckInAction(current.id, i)}
                  className="flex gap-3 text-left w-full group"
                >
                  <span
                    aria-hidden
                    className={`mt-1 w-4 h-4 shrink-0 rounded-[2px] border transition-quiet ${
                      a.done ? "bg-accent border-accent" : "border-gray-mid group-hover:border-accent"
                    }`}
                  />
                  <span
                    className={`text-[0.95rem] leading-relaxed ${
                      a.done ? "text-gray-mid line-through" : ""
                    }`}
                  >
                    {a.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="label-caps hover:text-ink transition-quiet"
          >
            {historyOpen ? "Hide" : "Show"} check-in history ({history.length})
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-2">
              {history.map((c) => (
                <Card key={c.id} className="p-4">
                  <p className="label-caps mb-2">
                    Week of {new Date(c.weekOf).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </p>
                  <ul className="text-[0.88rem] text-gray-strong space-y-1">
                    {c.actions.map((a, i) => (
                      <li key={i}>{a.done ? "✓" : "—"} {a.text}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ————— Student dashboard ————— */

function StudentDashboard({ profile }: { profile: StudentProfile }) {
  const { mode, list, recentlyViewed, essays, recommenders } = useApp();

  const deadlines = useMemo(() => {
    const out: { label: string; days: number; schoolId: string }[] = [];
    for (const e of list) {
      const s = getSchool(e.schoolId);
      if (!s) continue;
      const dl = nextDeadline(s, e.plan);
      if (dl) {
        const days = daysUntil(dl.date);
        if (days >= 0) out.push({ label: `${s.shortName} · ${dl.plan}`, days, schoolId: s.id });
      }
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 3);
  }, [list]);

  const counts = useMemo(
    () => ({
      reach: list.filter((e) => e.tier === "reach").length,
      target: list.filter((e) => e.tier === "target").length,
      likely: list.filter((e) => e.tier === "likely").length,
    }),
    [list]
  );
  const balance = listBalance(counts);

  /* Application completeness — proportions, not a grade of the student */
  const progress = useMemo(() => {
    if (list.length === 0) return 0;
    let total = 0;
    let done = 0;
    for (const e of list) {
      total += 3; // plan chosen, essay-ready, submitted
      if (e.plan) done += 1;
      if (
        essays.some((es) => (es.schoolId === e.schoolId || !es.schoolId) && es.text.trim().length > 50)
      )
        done += 1;
      if (["submitted", "materials-received", "decision"].includes(e.status)) done += 1;
    }
    return done / total;
  }, [list, essays]);

  const recsInFlight = recommenders.filter((r) => r.status !== "submitted").length;

  return (
    <div className="animate-fade-up space-y-8">
      <div>
        <SectionLabel className="mb-3">{gradeModeLabel[mode]} mode</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>Hi {profile.firstName}.</em> Here&apos;s where things stand.
        </TwoTone>
      </div>

      <CheckInCard />

      <div className="grid md:grid-cols-3 gap-4">
        {/* Next deadlines */}
        <Card className="p-5">
          <SectionLabel className="mb-3">Next deadlines</SectionLabel>
          {deadlines.length === 0 ? (
            <p className="text-[0.9rem] text-gray-strong">
              None on the clock. {mode === "build" || mode === "explore" ? "Exactly right for where you are." : "Check your list's plans."}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {deadlines.map((d) => (
                <li key={d.label} className="flex items-baseline justify-between gap-2 text-[0.92rem]">
                  <Link href={`/explore/${d.schoolId}`} className="hover:underline underline-offset-2 truncate">
                    {d.label}
                  </Link>
                  <span className={`whitespace-nowrap ${d.days <= 14 ? "text-ink font-semibold" : "text-gray-mid"}`}>
                    {d.days}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* List balance */}
        <Card className="p-5">
          <SectionLabel className="mb-3">List balance</SectionLabel>
          <div className="flex h-2 rounded-full overflow-hidden bg-fill mb-3">
            <div className="bg-reach" style={{ width: `${(counts.reach / (list.length || 1)) * 100}%` }} />
            <div className="bg-target" style={{ width: `${(counts.target / (list.length || 1)) * 100}%` }} />
            <div className="bg-likely" style={{ width: `${(counts.likely / (list.length || 1)) * 100}%` }} />
          </div>
          <div className="flex gap-3 mb-2">
            {(["reach", "target", "likely"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-[0.8rem]">
                <TierBadge tier={t} /> {counts[t]}
              </span>
            ))}
          </div>
          <Link href="/list" className="text-[0.85rem] underline underline-offset-2">
            Open list →
          </Link>
        </Card>

        {/* Application progress */}
        <Card className="p-5">
          <SectionLabel className="mb-3">Application progress</SectionLabel>
          <div className="flex items-center gap-4">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-fill)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${progress * 176} 176`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="text-[0.88rem] text-gray-strong leading-relaxed">
              {Math.round(progress * 100)}% of the mechanical work done.
              {recsInFlight > 0 && <> {recsInFlight} rec letter{recsInFlight === 1 ? "" : "s"} still in flight.</>}
            </div>
          </div>
          <Link href="/apply" className="text-[0.85rem] underline underline-offset-2 block mt-2">
            Open application manager →
          </Link>
        </Card>
      </div>

      {/* Counselor nudge */}
      <Card className="p-6 md:flex items-center justify-between gap-6">
        <div>
          <SectionLabel className="mb-2">From your counselor</SectionLabel>
          <p className="text-[1rem] leading-relaxed max-w-2xl">{balance.message}</p>
        </div>
        <div className="mt-4 md:mt-0 shrink-0">
          <Button href="/counselor" variant="primary">Talk it through</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Throughline */}
        <Card className="p-6">
          <SectionLabel className="mb-3">Your Throughline</SectionLabel>
          <p className="text-[0.98rem] leading-relaxed mb-4">
            You keep choosing the version of things with more responsibility —
            the captainship, the job with actual stakes, the harder science
            class. Care plus follow-through, aimed at living things. That&apos;s
            a story an admissions reader remembers.
          </p>
          <div className="flex flex-wrap gap-2">
            {["Science Olympiad captain", "3 yrs hospital volunteering", "Vet clinic job", "AP science arc"].map((c) => (
              <span key={c} className="px-3 py-1 rounded-full bg-fill text-[0.82rem] text-gray-strong">
                {c}
              </span>
            ))}
          </div>
        </Card>

        {/* Recently viewed */}
        <Card className="p-6">
          <SectionLabel className="mb-3">Recently viewed</SectionLabel>
          {recentlyViewed.length === 0 ? (
            <p className="text-[0.9rem] text-gray-strong">
              Nothing yet — <Link href="/explore" className="underline underline-offset-2 text-ink">start exploring</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentlyViewed.slice(0, 4).map((id) => {
                const s = getSchool(id);
                if (!s) return null;
                return (
                  <li key={id} className="flex items-baseline justify-between gap-3 text-[0.92rem]">
                    <Link href={`/explore/${id}`} className="hover:underline underline-offset-2">
                      {s.name}
                    </Link>
                    <span className="text-[0.8rem] text-gray-mid whitespace-nowrap">
                      ~${Math.round(s.cost.avgNetPrice / 1000)}k net
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ————— Parent dashboard ————— */

function ParentDashboard({ profile }: { profile: ParentProfile }) {
  const { mode, list } = useApp();

  const deadlines = useMemo(() => {
    const out: { label: string; days: number }[] = [];
    for (const e of list) {
      const s = getSchool(e.schoolId);
      if (!s) continue;
      const dl = nextDeadline(s, e.plan);
      if (dl) {
        const days = daysUntil(dl.date);
        if (days >= 0) out.push({ label: `${s.shortName} · ${dl.plan}`, days });
      }
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 4);
  }, [list]);

  const submitted = list.filter((e) =>
    ["submitted", "materials-received", "decision"].includes(e.status)
  ).length;

  const seasonContext: Record<string, string> = {
    build:
      "Right now, nothing is urgent — and that's the truth, not reassurance. These years are about course choices and letting real interests surface. The best thing on the calendar this month is dinner-table curiosity about what your student actually enjoys.",
    explore:
      "This is the year of narrowing: testing decisions, early visits, teacher relationships. Most families feel behind right now. Most families are, by internet standards — which are wrong. There is plenty of time.",
    apply:
      "Application season. Your student is likely more stressed than they show, and deadlines cluster brutally in October–January. The most useful parental job right now is logistics and meals, not essay edits.",
    decide:
      "Decisions arrive and it's emotional whiplash — for everyone. Your job this season: keep costs honest, keep the timeline visible (May 1), and let the student own the final call with you beside them.",
  };

  return (
    <div className="animate-fade-up space-y-8">
      <div>
        <SectionLabel className="mb-3">{gradeModeLabel[mode]} mode · parent view</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>Hi {profile.firstName}.</em> Here&apos;s the honest picture.
        </TwoTone>
      </div>

      {/* This week's context */}
      <Card className="p-6 border-accent/30 bg-accent-soft">
        <SectionLabel className="mb-3 !text-accent">
          What&apos;s normally happening right now
        </SectionLabel>
        <p className="text-[1rem] leading-relaxed max-w-2xl">{seasonContext[mode]}</p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Progress at a glance */}
        <Card className="p-5">
          <SectionLabel className="mb-3">Progress at a glance</SectionLabel>
          <p className="text-[0.95rem] leading-relaxed mb-3">
            {list.length} schools on the list · {submitted} application{submitted === 1 ? "" : "s"} submitted.
          </p>
          <p className="text-[0.85rem] text-gray-mid leading-relaxed border-t border-hairline pt-3">
            You&apos;re seeing the shared view: the list, statuses, and
            deadlines. Your student&apos;s counselor conversations and essay
            drafts stay private unless they choose to share — that boundary is
            deliberate, and it&apos;s part of why this works.
          </p>
        </Card>

        {/* Deadlines & milestones */}
        <Card className="p-5">
          <SectionLabel className="mb-3">Deadlines &amp; money milestones</SectionLabel>
          {deadlines.length === 0 ? (
            <p className="text-[0.9rem] text-gray-strong">No application deadlines on the clock.</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {deadlines.map((d) => (
                <li key={d.label} className="flex items-baseline justify-between text-[0.92rem]">
                  <span>{d.label}</span>
                  <span className={d.days <= 14 ? "text-ink font-semibold" : "text-gray-mid"}>{d.days}d</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[0.85rem] text-gray-strong border-t border-hairline pt-3">
            FAFSA opens in the fall of senior year — filing early is one of the
            few pure wins in this process. (FAFSA = the free federal aid form;
            it drives most need-based aid.)
          </p>
        </Card>
      </div>

      {/* Conversation starter */}
      <Card className="p-6">
        <SectionLabel className="mb-3">How to talk to your student about this</SectionLabel>
        <p className="text-[1rem] leading-relaxed max-w-2xl mb-3">
          Instead of &quot;did you finish your essay?&quot; — try &quot;what&apos;s
          the school you keep thinking about, and what is it about the place?&quot;
          Process questions read as pressure; curiosity questions read as
          interest. One is a check-up, the other is a conversation.
        </p>
        <Button href="/counselor" variant="outline">Ask me anything about this process</Button>
      </Card>
    </div>
  );
}

/* ————— Page ————— */

export default function DashboardPage() {
  const { profile } = useApp();
  if (!profile) {
    return (
      <div className="animate-fade-up max-w-xl">
        <TwoTone as="h1" size="lg" className="mb-6">
          <em>Welcome.</em> Let&apos;s get acquainted.
        </TwoTone>
        <p className="body-copy mb-8">
          Fifteen minutes of honest questions, and everything in here becomes
          personal to you.
        </p>
        <Button href="/onboarding" variant="primary" size="lg">Start onboarding</Button>
      </div>
    );
  }
  return profile.role === "student" ? (
    <StudentDashboard profile={profile} />
  ) : (
    <ParentDashboard profile={profile} />
  );
}
