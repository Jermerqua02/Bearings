"use client";

/* Application manager — our own workflow, Common App-capable in spirit.
   Tabs: Tracker · Profile · Essays · Recommenders · Deadlines · Aid. */

import { useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { type EssayFeedback } from "@/lib/counselor";
import { essayFeedbackAction } from "@/lib/actions/counselor";
import { getSchool } from "@/lib/data/schools";
import { daysUntil, nextDeadline } from "@/lib/match";
import { useApp } from "@/lib/profile-context";
import type { AidStatus, Essay, ListEntry, Recommender, School } from "@/lib/types";

type Tab = "tracker" | "profile" | "essays" | "recommenders" | "deadlines" | "aid";

const TABS: { id: Tab; label: string }[] = [
  { id: "tracker", label: "Tracker" },
  { id: "profile", label: "Profile" },
  { id: "essays", label: "Essays" },
  { id: "recommenders", label: "Recommenders" },
  { id: "deadlines", label: "Deadlines" },
  { id: "aid", label: "Financial aid" },
];

/* Per-school requirements — derived from school data (mock heuristics). */
function requirementsFor(school: School) {
  const isPrivateish = school.type !== "public" && school.type !== "public-flagship";
  return {
    supplements: isPrivateish ? 1 : 0,
    teacherRecs: isPrivateish ? 2 : school.type === "public-flagship" ? 1 : 0,
    counselorRec: isPrivateish,
    interview: isPrivateish && school.admissions.acceptanceRate < 0.35,
    fee: school.type === "public" ? 50 : 75,
    feeWaiverAvailable: true,
  };
}

const PIPELINE: ListEntry["status"][] = [
  "considering",
  "in-progress",
  "submitted",
  "materials-received",
  "decision",
];

const pipelineLabel: Record<ListEntry["status"], string> = {
  considering: "Not started",
  applying: "Not started",
  "in-progress": "In progress",
  submitted: "Submitted",
  "materials-received": "Materials received",
  decision: "Decision",
};

/* ————— Tracker tab ————— */

function TrackerTab() {
  const { list, updateListEntry, essays, recommenders } = useApp();
  const applying = list.filter((e) => e.status !== "considering" || e.plan);

  return (
    <div className="space-y-4">
      {applying.length === 0 && (
        <p className="body-copy">
          Nothing in motion yet. Pick a plan for a school on{" "}
          <Link href="/list" className="underline underline-offset-2 text-ink">your list</Link>{" "}
          and it appears here.
        </p>
      )}
      {applying.map((entry) => {
        const school = getSchool(entry.schoolId);
        if (!school) return null;
        const req = requirementsFor(school);
        const dl = nextDeadline(school, entry.plan);
        const days = dl ? daysUntil(dl.date) : null;
        const supplementDone =
          req.supplements === 0 ||
          essays.some((e) => e.schoolId === school.id && e.text.trim().length > 50);
        const recsAssigned = recommenders.filter((r) =>
          r.schoolIds.includes(school.id)
        ).length;
        const stageIndex = PIPELINE.indexOf(
          entry.status === "applying" ? "in-progress" : entry.status
        );

        return (
          <Card key={entry.schoolId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <Link
                  href={`/explore/${school.id}`}
                  className="font-semibold text-[1.05rem] hover:underline underline-offset-2"
                >
                  {school.name}
                </Link>
                <p className="text-[0.82rem] text-gray-mid mt-0.5">
                  {entry.plan ?? "No plan chosen"}
                  {dl && days !== null && days >= 0 && (
                    <> · due {dl.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ({days}d)</>
                  )}
                </p>
              </div>
              <select
                value={entry.status}
                onChange={(e) =>
                  updateListEntry(school.id, { status: e.target.value as ListEntry["status"] })
                }
                aria-label={`Status for ${school.shortName}`}
                className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
              >
                {PIPELINE.map((s) => (
                  <option key={s} value={s}>{pipelineLabel[s]}</option>
                ))}
              </select>
            </div>

            {/* Pipeline */}
            <div className="flex items-center gap-1 mb-4" aria-hidden>
              {PIPELINE.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${
                    i <= stageIndex ? "bg-accent" : "bg-fill"
                  }`}
                />
              ))}
            </div>

            {/* Requirements checklist */}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[0.88rem]">
              <p className={supplementDone ? "text-gray-mid" : ""}>
                {supplementDone ? "✓" : "○"} {req.supplements > 0 ? `${req.supplements} supplement essay` : "No supplement required"}
              </p>
              <p className={recsAssigned >= req.teacherRecs ? "text-gray-mid" : ""}>
                {recsAssigned >= req.teacherRecs ? "✓" : "○"} {req.teacherRecs} teacher rec{req.teacherRecs === 1 ? "" : "s"}
                {req.counselorRec ? " + counselor letter" : ""}
              </p>
              {req.interview && <p>○ Interview offered — <Link href="/interviews" className="underline underline-offset-2">practice first</Link></p>}
              <p>
                ○ ${req.fee} fee{" "}
                <span className="text-gray-mid">(waivers available — ask your school counselor)</span>
              </p>
            </div>

            {entry.status === "decision" && (
              <div className="mt-4 pt-4 border-t border-hairline flex items-center gap-3">
                <span className="label-caps">Outcome</span>
                <select
                  value={entry.outcome ?? ""}
                  onChange={(e) =>
                    updateListEntry(school.id, {
                      outcome: (e.target.value || undefined) as ListEntry["outcome"],
                    })
                  }
                  aria-label={`Decision outcome for ${school.shortName}`}
                  className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
                >
                  <option value="">—</option>
                  <option value="accepted">Accepted</option>
                  <option value="waitlisted">Waitlisted</option>
                  <option value="deferred">Deferred</option>
                  <option value="denied">Denied</option>
                </select>
                <Link href="/decide" className="text-[0.85rem] underline underline-offset-2 ml-auto">
                  Decision center →
                </Link>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ————— Profile tab ————— */

function Field({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label-caps block mb-1.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink transition-quiet"
      />
    </label>
  );
}

function ProfileTab() {
  const { universal, updateUniversal, activities } = useApp();
  return (
    <div className="space-y-8 max-w-2xl">
      <p className="text-[0.9rem] text-gray-strong">
        Enter this once — it flows into every application. Autosaves as you type.
      </p>
      <section>
        <SectionLabel className="mb-4">Personal</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Legal name" value={universal.legalName} onChange={(v) => updateUniversal({ legalName: v })} />
          <Field label="Preferred name" value={universal.preferredName} onChange={(v) => updateUniversal({ preferredName: v })} />
          <Field label="Date of birth" value={universal.dateOfBirth} onChange={(v) => updateUniversal({ dateOfBirth: v })} />
          <Field label="Citizenship" value={universal.citizenship} onChange={(v) => updateUniversal({ citizenship: v })} />
          <Field label="Email" value={universal.email} onChange={(v) => updateUniversal({ email: v })} />
          <Field label="Phone" value={universal.phone} onChange={(v) => updateUniversal({ phone: v })} />
          <Field label="Address" value={universal.address} onChange={(v) => updateUniversal({ address: v })} wide />
        </div>
      </section>
      <section>
        <SectionLabel className="mb-4">Family &amp; school</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Parent education" value={universal.parentEducation} onChange={(v) => updateUniversal({ parentEducation: v })} wide />
          <Field label="High school" value={universal.highSchoolName} onChange={(v) => updateUniversal({ highSchoolName: v })} />
          <Field label="City" value={universal.highSchoolCity} onChange={(v) => updateUniversal({ highSchoolCity: v })} />
          <Field label="Graduation year" value={universal.gradYear} onChange={(v) => updateUniversal({ gradYear: v })} />
        </div>
      </section>
      <section>
        <SectionLabel className="mb-4">Activities (from your log)</SectionLabel>
        {activities.length === 0 ? (
          <p className="text-[0.9rem] text-gray-strong">
            Your <Link href="/planner" className="underline underline-offset-2 text-ink">activity log</Link>{" "}
            feeds this list automatically — nothing gets re-typed senior year.
          </p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="border border-hairline rounded-[3px] bg-surface p-3 text-[0.9rem]">
                <span className="font-medium">{a.name}</span>
                {a.role && <span className="text-gray-strong"> — {a.role}</span>}
                <span className="text-gray-mid"> · {a.hoursPerWeek} hr/wk, {a.weeksPerYear} wk/yr</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionLabel className="mb-4">Honors</SectionLabel>
        <ul className="list-none space-y-1.5 text-[0.9rem]">
          {universal.honors.map((h, i) => (
            <li key={i} className="flex justify-between gap-3 border border-hairline rounded-[3px] bg-surface p-3">
              <span>{h}</span>
              <button
                onClick={() => updateUniversal({ honors: universal.honors.filter((_, j) => j !== i) })}
                aria-label={`Remove honor: ${h}`}
                className="text-gray-mid hover:text-ink"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <AddHonor onAdd={(h) => updateUniversal({ honors: [...universal.honors, h] })} />
      </section>
      <section>
        <SectionLabel className="mb-2">Additional information</SectionLabel>
        <textarea
          value={universal.additionalInfo}
          onChange={(e) => updateUniversal({ additionalInfo: e.target.value })}
          rows={4}
          placeholder="Context colleges should know — circumstances, interruptions, anything that explains your record."
          className="w-full border border-hairline rounded-[3px] bg-surface p-3 text-[0.92rem] leading-relaxed outline-none focus:border-ink transition-quiet resize-none"
        />
      </section>
    </div>
  );
}

function AddHonor({ onAdd }: { onAdd: (h: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
      className="flex gap-2 mt-3"
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Add an honor or award"
        aria-label="Add an honor or award"
        className="flex-1 border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
      />
      <Button variant="outline" type="submit">Add</Button>
    </form>
  );
}

/* ————— Essays tab ————— */

function EssaysTab() {
  const { essays, updateEssay, addEssay, profile, list } = useApp();
  const student = profile?.role === "student" ? profile : null;
  const [activeId, setActiveId] = useState<string | null>(essays[0]?.id ?? null);
  const [feedback, setFeedback] = useState<EssayFeedback | null>(null);
  const [critiquing, setCritiquing] = useState(false);

  const active = essays.find((e) => e.id === activeId) ?? null;
  const words = active ? active.text.trim().split(/\s+/).filter(Boolean).length : 0;

  const requestFeedback = async () => {
    if (!student || !active || !active.text.trim()) return;
    setCritiquing(true);
    setFeedback(null);
    const fb = await essayFeedbackAction({ promptText: active.promptText, essayText: active.text });
    setFeedback(fb);
    setCritiquing(false);
  };

  const saveVersion = () => {
    if (!active) return;
    updateEssay(active.id, {
      versions: [
        ...active.versions,
        { id: `v-${Date.now()}`, text: active.text, savedAt: new Date().toISOString() },
      ],
    });
  };

  const addSupplement = () => {
    const candidates = list.filter(
      (e) => !essays.some((es) => es.schoolId === e.schoolId)
    );
    const target = candidates[0] ? getSchool(candidates[0].schoolId) : null;
    const essay: Essay = {
      id: `e-${Date.now()}`,
      title: target ? `Why ${target.shortName}?` : "New essay",
      schoolId: target?.id,
      promptText: target
        ? `Tell us why ${target.name} is a good fit for you.`
        : "Add the prompt text here.",
      wordLimit: 250,
      text: "",
      versions: [],
    };
    addEssay(essay);
    setActiveId(essay.id);
    setFeedback(null);
  };

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      <aside className="space-y-1.5">
        {essays.map((e) => (
          <button
            key={e.id}
            onClick={() => {
              setActiveId(e.id);
              setFeedback(null);
            }}
            className={`block w-full text-left px-3 py-2.5 rounded-[3px] text-[0.88rem] transition-quiet ${
              e.id === activeId ? "bg-fill text-ink" : "text-gray-strong hover:bg-fill"
            }`}
          >
            <span className="block truncate font-medium">{e.title}</span>
            <span className="text-[0.75rem] text-gray-mid">
              {e.text.trim() ? `${e.text.trim().split(/\s+/).length} words` : "Empty"} · limit {e.wordLimit}
            </span>
          </button>
        ))}
        <button
          onClick={addSupplement}
          className="block w-full text-left px-3 py-2.5 rounded-[3px] border border-hairline text-[0.88rem] hover:border-ink transition-quiet"
        >
          + New supplement
        </button>
      </aside>

      {active ? (
        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="font-semibold text-[1.1rem] mb-1">{active.title}</h2>
            <p className="text-[0.9rem] text-gray-strong leading-relaxed max-w-2xl">
              {active.promptText}
            </p>
          </div>
          <textarea
            value={active.text}
            onChange={(e) => updateEssay(active.id, { text: e.target.value })}
            rows={14}
            aria-label={`Essay draft: ${active.title}`}
            placeholder="Write here. Autosaves as you type."
            className="w-full border border-hairline rounded-[3px] bg-surface p-4 text-[1rem] leading-relaxed outline-none focus:border-ink transition-quiet resize-y"
          />
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span
              className={`text-[0.85rem] ${
                words > active.wordLimit ? "text-ink font-semibold" : "text-gray-mid"
              }`}
              aria-live="polite"
            >
              {words} / {active.wordLimit} words
              {words > active.wordLimit && " — over the limit"}
            </span>
            <span className="text-[0.8rem] text-gray-mid">Autosaved</span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={saveVersion}>
                Save version ({active.versions.length})
              </Button>
              <Button variant="primary" onClick={() => void requestFeedback()} disabled={critiquing || !active.text.trim()}>
                {critiquing ? "Reading…" : "Get feedback"}
              </Button>
            </div>
          </div>

          <p className="text-[0.8rem] text-gray-mid mt-4 border-t border-hairline pt-3 max-w-2xl">
            Your counselor critiques and asks questions — it never writes your
            essay. Admissions offices can tell, and more importantly, so can
            you. This draft is private; a linked parent can&apos;t see it unless
            you share it.
          </p>

          {feedback && (
            <Card className="p-5 mt-5 max-w-2xl">
              <SectionLabel className="mb-4">Counselor feedback</SectionLabel>
              <div className="space-y-3 mb-5">
                {feedback.observations.map((o) => (
                  <p key={o.area} className="text-[0.92rem] leading-relaxed">
                    <span className="label-caps mr-2">{o.area}</span>
                    {o.note}
                  </p>
                ))}
              </div>
              <SectionLabel className="mb-2">Questions to sit with</SectionLabel>
              <ul className="space-y-1.5">
                {feedback.questions.map((q) => (
                  <li key={q} className="text-[0.92rem] leading-relaxed text-gray-strong">
                    — {q}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      ) : (
        <p className="body-copy">Select or create an essay.</p>
      )}
    </div>
  );
}

/* ————— Recommenders tab ————— */

function RecommendersTab() {
  const { recommenders, addRecommender, updateRecommender, removeRecommender, list } = useApp();
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");

  const recStatusNext: Record<Recommender["status"], Recommender["status"]> = {
    invited: "in-progress",
    "in-progress": "submitted",
    submitted: "submitted",
  };

  return (
    <div className="max-w-2xl space-y-5">
      {recommenders.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-semibold">{r.name}</p>
              <p className="text-[0.85rem] text-gray-mid">{r.roleTitle} · {r.type}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`label-caps ${r.status === "submitted" ? "!text-target" : ""}`}>
                {r.status.replace("-", " ")}
              </span>
              <button
                onClick={() => removeRecommender(r.id)}
                aria-label={`Remove ${r.name}`}
                className="text-gray-mid hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-[0.85rem] text-gray-strong mb-3">
            Assigned to:{" "}
            {r.schoolIds.map((id) => getSchool(id)?.shortName).filter(Boolean).join(", ") || "no schools yet"}
          </p>
          <div className="flex flex-wrap gap-2">
            {list.map((e) => {
              const s = getSchool(e.schoolId);
              if (!s) return null;
              const assigned = r.schoolIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    updateRecommender(r.id, {
                      schoolIds: assigned
                        ? r.schoolIds.filter((x) => x !== s.id)
                        : [...r.schoolIds, s.id],
                    })
                  }
                  aria-pressed={assigned}
                  className={`px-3 py-1 rounded-full border text-[0.8rem] transition-quiet ${
                    assigned ? "border-ink bg-ink text-white" : "border-hairline text-gray-strong hover:border-ink"
                  }`}
                >
                  {s.shortName}
                </button>
              );
            })}
            {r.status !== "submitted" && (
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={() => updateRecommender(r.id, { status: recStatusNext[r.status] })}
              >
                {r.status === "invited" ? "Mark in progress" : "Mark submitted"}
              </Button>
            )}
            {r.status === "in-progress" && (
              <Button variant="ghost" onClick={() => { /* reminder is a mock */ }}>
                Send gentle reminder
              </Button>
            )}
          </div>
        </Card>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          addRecommender({
            id: `r-${Date.now()}`,
            name: name.trim(),
            roleTitle: roleTitle.trim() || "Teacher",
            type: roleTitle.toLowerCase().includes("counsel") ? "counselor" : "teacher",
            schoolIds: [],
            status: "invited",
          });
          setName("");
          setRoleTitle("");
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Recommender name"
          className="flex-1 min-w-[140px] border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
        />
        <input
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder="Role (e.g. AP Bio teacher)"
          aria-label="Recommender role"
          className="flex-1 min-w-[180px] border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
        />
        <Button variant="outline" type="submit">Invite</Button>
      </form>
      <p className="text-[0.85rem] text-gray-mid">
        Ask teachers who know you, not just teachers who graded you well — and
        ask early. September you will thank October you.
      </p>
    </div>
  );
}

/* ————— Deadlines tab ————— */

function DeadlinesTab() {
  const { list } = useApp();
  const items = useMemo(() => {
    const out: { date: Date; label: string; schoolId: string; days: number }[] = [];
    for (const e of list) {
      const s = getSchool(e.schoolId);
      if (!s) continue;
      const dl = nextDeadline(s, e.plan);
      if (dl) {
        out.push({
          date: dl.date,
          label: `${s.shortName} — ${dl.plan}`,
          schoolId: s.id,
          days: daysUntil(dl.date),
        });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [list]);

  const soon = items.filter((i) => i.days >= 0 && i.days <= 14);

  return (
    <div className="max-w-2xl">
      {soon.length > 0 && (
        <Card className="p-4 mb-6 bg-accent-soft border-accent/30">
          <SectionLabel className="mb-2 !text-accent">Due in the next 14 days</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {soon.map((i) => (
              <span key={i.label} className="px-3 py-1 rounded-full bg-surface border border-hairline text-[0.85rem]">
                {i.label} · {i.days}d
              </span>
            ))}
          </div>
        </Card>
      )}
      <ol className="relative border-l border-hairline ml-2 space-y-6">
        {items.map((i) => (
          <li key={i.label} className="pl-6 relative">
            <span
              aria-hidden
              className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${
                i.days < 0 ? "bg-hairline" : i.days <= 14 ? "bg-accent" : "bg-gray-mid"
              }`}
            />
            <p className="label-caps mb-0.5">
              {i.date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })}
            </p>
            <Link href={`/explore/${i.schoolId}`} className="font-medium hover:underline underline-offset-2">
              {i.label}
            </Link>
            {i.days >= 0 && <span className="text-[0.85rem] text-gray-mid ml-2">{i.days} days</span>}
          </li>
        ))}
      </ol>
      {items.length === 0 && (
        <p className="body-copy">No deadlines yet — pick application plans on your list.</p>
      )}
    </div>
  );
}

/* ————— Aid tab ————— */

function AidTab() {
  const { aidStatus, setAidStatus, list, aidOffers, upsertAidOffer } = useApp();
  const decided = list.filter((e) => e.outcome === "accepted");

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <SectionLabel className="mb-4">Aid forms</SectionLabel>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              ["FAFSA", "fafsa", ["not-started", "in-progress", "submitted"]],
              ["CSS Profile", "cssProfile", ["not-needed", "not-started", "in-progress", "submitted"]],
            ] as const
          ).map(([label, key, options]) => (
            <Card key={key} className="p-4">
              <p className="font-medium mb-1">{label}</p>
              <p className="text-[0.8rem] text-gray-mid mb-3">
                {key === "fafsa"
                  ? "Free federal form — determines your SAI (Student Aid Index, the number that drives need-based aid)."
                  : "Required by some private colleges for their own aid."}
              </p>
              <select
                value={aidStatus[key]}
                onChange={(e) =>
                  setAidStatus({ [key]: e.target.value } as Partial<AidStatus>)
                }
                aria-label={`${label} status`}
                className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
              >
                {options.map((o) => (
                  <option key={o} value={o}>{o.replace(/-/g, " ")}</option>
                ))}
              </select>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2">Award letters</SectionLabel>
        <p className="text-[0.9rem] text-gray-strong mb-4">
          When acceptances arrive, log each offer here — the{" "}
          <Link href="/decide" className="underline underline-offset-2 text-ink">decision center</Link>{" "}
          turns them into a true-cost comparison.
        </p>
        {decided.length === 0 ? (
          <p className="text-[0.9rem] text-gray-mid">
            No acceptances logged yet. (They&apos;ll come. Keep going.)
          </p>
        ) : (
          decided.map((e) => {
            const s = getSchool(e.schoolId);
            if (!s) return null;
            const offer = aidOffers.find((o) => o.schoolId === s.id) ?? {
              schoolId: s.id,
              coa: s.cost.stickerPrice,
              grants: 0,
              loans: 0,
              workStudy: 0,
            };
            return (
              <Card key={s.id} className="p-4 mb-3">
                <p className="font-medium mb-3">{s.shortName}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    [
                      ["Cost of attendance", "coa"],
                      ["Grants / scholarships", "grants"],
                      ["Loans offered", "loans"],
                      ["Work-study", "workStudy"],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="block">
                      <span className="label-caps block mb-1">{label}</span>
                      <input
                        type="number"
                        value={offer[key] || ""}
                        onChange={(ev) =>
                          upsertAidOffer({ ...offer, [key]: Number(ev.target.value) || 0 })
                        }
                        className="w-full border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.88rem] outline-none focus:border-ink"
                      />
                    </label>
                  ))}
                </div>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}

/* ————— Page ————— */

export default function ApplyPage() {
  const [tab, setTab] = useState<Tab>("tracker");
  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionLabel className="mb-3">Apply</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>One calm surface</em> for the whole application.
        </TwoTone>
      </div>
      <div
        role="tablist"
        aria-label="Application sections"
        className="flex gap-1 overflow-x-auto no-scrollbar border-b border-hairline mb-8"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[0.88rem] whitespace-nowrap border-b-2 -mb-px transition-quiet ${
              tab === t.id
                ? "border-ink text-ink font-medium"
                : "border-transparent text-gray-mid hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tracker" && <TrackerTab />}
      {tab === "profile" && <ProfileTab />}
      {tab === "essays" && <EssaysTab />}
      {tab === "recommenders" && <RecommendersTab />}
      {tab === "deadlines" && <DeadlinesTab />}
      {tab === "aid" && <AidTab />}
    </div>
  );
}
