"use client";

/* Counselor — the heart of the app.
   Full-screen conversation with rich inline cards, thread memory,
   an editable "About you" panel, and gentle nudges. */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import {
  counselor,
  type CounselorCard,
  type CounselorMessage,
} from "@/lib/counselor";
import { getSchool } from "@/lib/data/schools";
import { useApp } from "@/lib/profile-context";
import type { ChanceTier } from "@/lib/types";

interface Thread {
  id: string;
  title: string;
  messages: CounselorMessage[];
}

const SUGGESTED_PROMPTS = [
  "Am I being realistic?",
  "What schools am I missing?",
  "How do I stand out with a 3.4?",
  "Explain early decision vs. early action",
  "Is this school worth the money?",
];

/* ————— Card renderers ————— */

function SchoolCardInline({ schoolId, reason }: { schoolId: string; reason: string }) {
  const school = getSchool(schoolId);
  if (!school) return null;
  return (
    <Link
      href={`/explore/${school.id}`}
      className="block border border-hairline bg-surface rounded-[3px] p-4 hover:border-ink transition-quiet"
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-semibold text-[0.98rem]">{school.name}</span>
        <span className="label-caps whitespace-nowrap">
          {school.city}, {school.state}
        </span>
      </div>
      <p className="text-[0.9rem] text-gray-strong leading-relaxed">{reason}</p>
      <p className="text-[0.8rem] text-gray-mid mt-2">
        Avg. net price ${school.cost.avgNetPrice.toLocaleString()} / yr ·{" "}
        {Math.round(school.admissions.acceptanceRate * 100)}% admit rate
      </p>
    </Link>
  );
}

function TierBreakdownCard({ tiers }: { tiers: { tier: ChanceTier; count: number }[] }) {
  const total = tiers.reduce((s, t) => s + t.count, 0) || 1;
  return (
    <div className="border border-hairline bg-surface rounded-[3px] p-4">
      <SectionLabel className="mb-3">Your list right now</SectionLabel>
      <div className="flex h-2 rounded-full overflow-hidden bg-fill mb-3">
        {tiers.map((t) => (
          <div
            key={t.tier}
            className={
              t.tier === "reach"
                ? "bg-reach"
                : t.tier === "target"
                  ? "bg-target"
                  : "bg-likely"
            }
            style={{ width: `${(t.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex gap-4">
        {tiers.map((t) => (
          <span key={t.tier} className="flex items-center gap-2 text-[0.85rem]">
            <TierBadge tier={t.tier} /> {t.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChecklistCard({ title, items }: { title: string; items: { text: string; done: boolean }[] }) {
  return (
    <div className="border border-hairline bg-surface rounded-[3px] p-4">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[0.92rem] leading-relaxed">
            <span
              aria-hidden
              className={`mt-1 w-3.5 h-3.5 shrink-0 rounded-[2px] border ${
                it.done ? "bg-ink border-ink" : "border-gray-mid"
              }`}
            />
            <span className={it.done ? "text-gray-mid line-through" : ""}>
              {it.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineCard({ items }: { items: { date: string; label: string; schoolId?: string }[] }) {
  return (
    <div className="border border-hairline bg-surface rounded-[3px] p-4">
      <SectionLabel className="mb-3">Coming up</SectionLabel>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-baseline gap-3 text-[0.92rem]">
            <span className="label-caps whitespace-nowrap w-16">
              {new Date(it.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonCard({ schoolIds, rows }: { schoolIds: string[]; rows: { label: string; values: string[] }[] }) {
  return (
    <div className="border border-hairline bg-surface rounded-[3px] p-4 overflow-x-auto">
      <table className="w-full text-[0.88rem]">
        <thead>
          <tr>
            <th />
            {schoolIds.map((id) => (
              <th key={id} className="text-left font-semibold pb-2 pr-4">
                {getSchool(id)?.shortName ?? id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-hairline">
              <td className="label-caps py-2 pr-3">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="py-2 pr-4">{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardBlock({ card }: { card: CounselorCard }) {
  switch (card.kind) {
    case "school":
      return <SchoolCardInline schoolId={card.schoolId} reason={card.reason} />;
    case "tier-breakdown":
      return <TierBreakdownCard tiers={card.tiers} />;
    case "checklist":
      return <ChecklistCard title={card.title} items={card.items} />;
    case "timeline":
      return <TimelineCard items={card.items} />;
    case "comparison":
      return <ComparisonCard schoolIds={card.schoolIds} rows={card.rows} />;
  }
}

/* ————— About-you panel ————— */

function AboutYouPanel({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useApp();
  if (!profile || profile.role !== "student") return null;
  return (
    <aside
      aria-label="What your counselor knows about you"
      className="border border-hairline bg-surface rounded-[3px] p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <SectionLabel>About you</SectionLabel>
        <button
          onClick={onClose}
          className="text-[0.8rem] text-gray-mid hover:text-ink transition-quiet"
        >
          Close
        </button>
      </div>
      <p className="text-[0.82rem] text-gray-mid leading-relaxed">
        This is what I currently know. Correct anything — I&apos;d rather be
        accurate than confident.
      </p>
      <dl className="space-y-3 text-[0.9rem]">
        <div>
          <dt className="label-caps mb-1">GPA (unweighted)</dt>
          <dd>
            <input
              value={profile.gpa.unweighted ?? ""}
              onChange={(e) =>
                updateProfile({
                  gpa: { ...profile.gpa, unweighted: Number(e.target.value) || undefined },
                })
              }
              className="w-20 border-b border-hairline bg-transparent focus:border-ink outline-none"
              aria-label="Unweighted GPA"
            />
          </dd>
        </div>
        <div>
          <dt className="label-caps mb-1">Advanced courses</dt>
          <dd>{profile.rigor.apCount} AP · {profile.rigor.honorsCount} honors</dd>
        </div>
        <div>
          <dt className="label-caps mb-1">Interests</dt>
          <dd>{profile.undecided ? "Undecided (a fine answer)" : profile.intendedMajors.join(", ")}</dd>
        </div>
        <div>
          <dt className="label-caps mb-1">Budget</dt>
          <dd>
            {profile.budget.maxPerYear
              ? `~$${profile.budget.maxPerYear.toLocaleString()} / yr`
              : "Not set"}{" "}
            · {profile.budget.willFileFafsa ? "filing FAFSA" : "not filing FAFSA"}
          </dd>
        </div>
        <div>
          <dt className="label-caps mb-1">What matters to you</dt>
          <dd className="text-gray-strong">
            {profile.values.map((v) => v.replace(/-/g, " ")).join(" · ") || "—"}
          </dd>
        </div>
      </dl>
      <p className="text-[0.78rem] text-gray-mid border-t border-hairline pt-3">
        Private to you. A linked parent never sees this conversation.
      </p>
    </aside>
  );
}

/* ————— Main chat ————— */

function CounselorInner() {
  const { profile } = useApp();
  const params = useSearchParams();
  const contextSchoolId = params.get("school");
  const contextSchool = contextSchoolId ? getSchool(contextSchoolId) : null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const active = threads.find((t) => t.id === activeId) ?? null;

  const startThread = useCallback(async () => {
    if (!profile) return;
    const greeting = await counselor.greet(profile);
    if (contextSchool) {
      greeting.text = `Let's talk about ${contextSchool.name}. I've pulled up what I know — and what I know about you. What's on your mind: fit, cost, chances, or something else?`;
    }
    const t: Thread = {
      id: `t-${Date.now()}`,
      title: contextSchool ? `About ${contextSchool.shortName}` : "New conversation",
      messages: [greeting],
    };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
  }, [profile, contextSchool]);

  useEffect(() => {
    if (!startedRef.current && profile) {
      startedRef.current = true;
      void startThread();
    }
  }, [profile, startThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, busy]);

  const send = async (text: string) => {
    if (!profile || !active || !text.trim() || busy) return;
    const userMsg: CounselorMessage = {
      id: `u-${Date.now()}`,
      author: "user",
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === active.id
          ? {
              ...t,
              title:
                t.messages.length <= 1
                  ? text.trim().slice(0, 40)
                  : t.title,
              messages: [...t.messages, userMsg],
            }
          : t
      )
    );
    setInput("");
    setBusy(true);
    const res = await counselor.chat({
      profile,
      threadId: active.id,
      message: text.trim(),
      context: contextSchool ? { schoolId: contextSchool.id } : undefined,
      history: active.messages,
    });
    setThreads((prev) =>
      prev.map((t) =>
        t.id === active.id
          ? { ...t, messages: [...t.messages, res.message] }
          : t
      )
    );
    if (res.nudge) setNudge(res.nudge);
    setBusy(false);
  };

  if (!profile) return null;
  const fresh = (active?.messages.length ?? 0) <= 1;

  return (
    <div className="flex gap-6 h-[calc(100vh-8.5rem)] md:h-[calc(100vh-10rem)]">
      {/* Threads sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 gap-1">
        <button
          onClick={() => void startThread()}
          className="text-left px-3 py-2 rounded-[3px] border border-hairline text-[0.88rem] hover:border-ink transition-quiet mb-2"
        >
          + New conversation
        </button>
        <SectionLabel className="px-3 mb-1">Past conversations</SectionLabel>
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`text-left px-3 py-2 rounded-[3px] text-[0.88rem] truncate transition-quiet ${
              t.id === activeId
                ? "bg-fill text-ink"
                : "text-gray-strong hover:bg-fill"
            }`}
          >
            {t.title}
          </button>
        ))}
        <div className="mt-auto pt-3">
          <button
            onClick={() => setShowAbout((s) => !s)}
            className="text-left px-3 py-2 w-full rounded-[3px] border border-hairline text-[0.88rem] hover:border-ink transition-quiet"
          >
            What I know about you
          </button>
        </div>
      </aside>

      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0">
        {nudge && (
          <div className="flex items-center justify-between gap-3 border border-hairline bg-accent-soft rounded-[3px] px-4 py-2.5 mb-3">
            <p className="text-[0.88rem] text-accent">{nudge}</p>
            <button
              onClick={() => setNudge(null)}
              aria-label="Dismiss"
              className="text-accent/70 hover:text-accent text-[0.85rem]"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto space-y-5 pr-1"
          role="log"
          aria-label="Conversation with your counselor"
          aria-live="polite"
        >
          {active?.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-xl ${m.author === "user" ? "ml-auto" : ""}`}
            >
              <p
                className={`text-[1rem] leading-relaxed whitespace-pre-wrap rounded-[3px] px-4 py-3 ${
                  m.author === "user"
                    ? "bg-ink text-white"
                    : "bg-surface border border-hairline"
                }`}
              >
                {m.text}
              </p>
              {m.cards && (
                <div className="mt-3 space-y-3">
                  {m.cards.map((c, i) => (
                    <CardBlock key={i} card={c} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <p className="text-gray-mid text-[0.9rem] px-1">Thinking…</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested prompts */}
        {fresh && !busy && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-3">
            {SUGGESTED_PROMPTS.map((p) => (
              <Chip key={p} onClick={() => void send(p)} className="whitespace-nowrap shrink-0">
                {p}
              </Chip>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex gap-2 pt-3 border-t border-hairline"
        >
          <label htmlFor="counselor-input" className="sr-only">
            Message your counselor
          </label>
          <input
            id="counselor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything — I know your profile."
            className="flex-1 border border-hairline rounded-full bg-surface px-5 h-11 text-[0.95rem] focus:border-ink outline-none transition-quiet"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-11 px-6 rounded-full bg-ink text-white text-[0.72rem] uppercase tracking-[0.08em] font-medium disabled:opacity-40 transition-quiet"
          >
            Send
          </button>
        </form>
        <div className="lg:hidden pt-2">
          <button
            onClick={() => setShowAbout((s) => !s)}
            className="text-[0.8rem] text-gray-mid underline underline-offset-2"
          >
            {showAbout ? "Hide" : "Show"} what I know about you
          </button>
        </div>
      </div>

      {/* About-you (desktop right / mobile below toggle) */}
      {showAbout && (
        <div className="hidden lg:block w-72 shrink-0 overflow-y-auto">
          <AboutYouPanel onClose={() => setShowAbout(false)} />
        </div>
      )}
      {showAbout && (
        <div className="lg:hidden fixed inset-x-4 bottom-20 z-50 max-h-[60vh] overflow-y-auto shadow-none">
          <AboutYouPanel onClose={() => setShowAbout(false)} />
        </div>
      )}
    </div>
  );
}

export default function CounselorPage() {
  return (
    <Suspense fallback={null}>
      <CounselorInner />
    </Suspense>
  );
}
