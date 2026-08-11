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
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import {
  counselor,
  type CounselorCard,
  type CounselorMessage,
} from "@/lib/counselor";
import {
  chatAction,
  createThreadAction,
  greetAction,
  listThreadsAction,
} from "@/lib/actions/counselor";
import { formatDollars, formatRate, formatThousands } from "@/lib/format";
import { useApp } from "@/lib/profile-context";
import { useSchools } from "@/lib/use-schools";
import type { ChanceTier } from "@/lib/types";

interface Thread {
  id: string;
  title: string;
  messages: CounselorMessage[];
}

/* "How do I stand out with a 3.4?" used to be hardcoded here, so a student
   with a 3.9 or a 2.8 was offered a question about somebody else's grades.
   The generic form asks the same thing without inventing a number. */
const SUGGESTED_PROMPTS = [
  "Am I being realistic?",
  "What schools am I missing?",
  "How do I stand out with my grades?",
  "Explain early decision vs. early action",
  "Is this school worth the money?",
];

/* ————— Card renderers ————— */

function SchoolCardInline({ schoolId, reason }: { schoolId: string; reason: string }) {
  // A counselor card can name a school the student has never saved, so this
  // can't rely on the snapshot alone.
  const schools = useSchools([schoolId]);
  const school = schools.get(schoolId);
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
        {[
          school.cost.avgNetPrice != null &&
            `Avg. net price ${formatDollars(school.cost.avgNetPrice)} / yr`,
          school.admissions.acceptanceRate != null &&
            `${formatRate(school.admissions.acceptanceRate)} admit rate`,
        ]
          .filter(Boolean)
          .join(" · ")}
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
  const schools = useSchools(schoolIds);
  return (
    <div className="border border-hairline bg-surface rounded-[3px] p-4 overflow-x-auto">
      <table className="w-full text-[0.88rem]">
        <thead>
          <tr>
            <th />
            {schoolIds.map((id) => (
              <th key={id} className="text-left font-semibold pb-2 pr-4">
                {schools.get(id)?.shortName ?? id}
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
  // Arrives from a link on any school page, including ones not on the list.
  const contextSchools = useSchools(contextSchoolId ? [contextSchoolId] : []);
  const contextSchool = contextSchoolId ? (contextSchools.get(contextSchoolId) ?? null) : null;

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
    // The thread is created server-side so it persists; the id comes back
    // from the database rather than being minted in the browser.
    const id = await createThreadAction(
      contextSchool ? `About ${contextSchool.shortName}` : undefined,
    );
    const greeting = await greetAction(id);
    const t: Thread = {
      id,
      title: contextSchool ? `About ${contextSchool.shortName}` : "New conversation",
      messages: [greeting],
    };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
  }, [profile, contextSchool]);

  useEffect(() => {
    if (!startedRef.current && profile) {
      startedRef.current = true;
      // Resume persisted conversations; only start a new one if there are none.
      void listThreadsAction()
        .then((saved) => {
          if (saved.length > 0 && !contextSchool) {
            setThreads(saved);
            setActiveId(saved[saved.length - 1].id);
            return;
          }
          return startThread();
        })
        .catch(() => void startThread());
    }
  }, [profile, startThread]);

  useEffect(() => {
    // Only follow a live conversation. Scrolling to the bottom of a fresh
    // thread pushed the greeting up under the header on a phone, so the
    // first thing a student saw was the middle of a sentence.
    if ((active?.messages.length ?? 0) <= 1) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, busy, active]);

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
    // No profile and no history on the wire — the server reads both from
    // the session and the database.
    const reply = await chatAction({
      threadId: active.id,
      message: text.trim(),
      context: contextSchool ? { schoolId: contextSchool.id } : undefined,
    });
    setThreads((prev) =>
      prev.map((t) =>
        t.id === active.id
          ? { ...t, messages: [...t.messages, reply] }
          : t
      )
    );
    setBusy(false);
  };

  if (!profile) return null;
  const fresh = (active?.messages.length ?? 0) <= 1;

  return (
    <div className="flex gap-6 h-[calc(100vh-8.5rem)] md:h-[calc(100vh-10rem)]">
      {/* The chat is the whole page, so there is nowhere a headline belongs
          visually — but every other page has an h1, and without one a screen
          reader lands here with nothing naming the page. */}
      <h1 className="sr-only">Your counselor</h1>
      {/* Threads sidebar (desktop) */}
      <aside
        aria-label="Past conversations"
        className="hidden lg:flex flex-col w-56 shrink-0 gap-1"
      >
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
          className="flex-1 overflow-y-auto pr-1"
          role="log"
          aria-label="Conversation with your counselor"
          aria-live="polite"
        >
          {/*
            Fresh conversation: the suggestions are the page, not a strip of
            chips wedged above the input. They were a horizontally-scrolling
            row that clipped the fifth prompt off-screen with no affordance
            saying so, which made the most useful thing here the least
            visible. Full-width rows read in one pass and give a question the
            room its own sentence needs.
          */}
          {fresh && !busy ? (
            <div className="max-w-2xl">
              {active?.messages[0] && (
                <p className="text-[1.05rem] leading-relaxed whitespace-pre-wrap mb-10">
                  {active.messages[0].text}
                </p>
              )}
              <SectionLabel className="mb-1">Or start here</SectionLabel>
              <ul className="border-t border-hairline">
                {SUGGESTED_PROMPTS.map((p) => (
                  <li key={p} className="border-b border-hairline">
                    <button
                      onClick={() => void send(p)}
                      className="group w-full flex items-baseline justify-between gap-6 text-left py-4 md:py-5 transition-quiet hover:text-accent"
                    >
                      <span className="text-[1.05rem] md:text-[1.25rem] leading-snug tracking-[-0.01em]">
                        {p}
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 text-gray-mid group-hover:text-accent group-hover:translate-x-0.5 transition-quiet"
                      >
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-5">
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
              {busy && <p className="text-gray-mid text-[0.9rem] px-1">Thinking…</p>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/*
          One line, with the action on it. A pill input and a filled pill
          button read as a form to fill in; a single rule with the verb at
          the end reads as a place to type, which is what it is. The rule
          darkens on focus so the whole row is the focus indicator.
        */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="group flex items-center gap-3 mt-8 max-w-2xl border-b border-hairline focus-within:border-ink transition-quiet"
        >
          <label htmlFor="counselor-input" className="sr-only">
            Message your counselor
          </label>
          <input
            id="counselor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            className="flex-1 min-w-0 bg-transparent h-11 text-[1.05rem] outline-none placeholder:text-gray-mid transition-quiet"
          />
          {/* mr on mobile clears the floating feedback control, which sits at
              bottom-20 right-4 and otherwise covers this button — the primary
              action on the page. */}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 h-11 px-2 mr-28 md:mr-0 md:-mr-2 text-[0.95rem] font-medium text-ink hover:text-accent disabled:text-gray-mid disabled:hover:text-gray-mid transition-quiet"
          >
            {busy ? "Sending…" : "Ask →"}
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
