"use client";

/* Academic & activity planner — the primary surface in Build mode.
   For underclassmen the job is shaping the profile, not searching schools. */

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { opportunities } from "@/lib/data/opportunities";
import { useApp } from "@/lib/profile-context";
import type { Activity, CoursePlanEntry, GradeLevel } from "@/lib/types";

type Tab = "courses" | "activities" | "opportunities";

const SUBJECTS: CoursePlanEntry["subject"][] = [
  "English", "Math", "Science", "Social Studies", "Language", "Arts", "Elective",
];

const GRADES: GradeLevel[] = [9, 10, 11, 12];

const gradePoints: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7, D: 1.0, F: 0,
};

function gpaFrom(courses: CoursePlanEntry[]) {
  const graded = courses.filter((c) => c.grade && gradePoints[c.grade] !== undefined);
  if (!graded.length) return { unweighted: null as number | null, weighted: null as number | null };
  let uw = 0;
  let w = 0;
  for (const c of graded) {
    const pts = gradePoints[c.grade!];
    uw += pts;
    w += pts + (c.level === "ap" || c.level === "ib" ? 1 : c.level === "honors" ? 0.5 : 0);
  }
  return {
    unweighted: Math.round((uw / graded.length) * 100) / 100,
    weighted: Math.round((w / graded.length) * 100) / 100,
  };
}

/* ————— Courses tab ————— */

function CoursesTab() {
  const { coursePlan, addCourse, removeCourse, updateCourse } = useApp();
  const [adding, setAdding] = useState<{ year: GradeLevel; subject: CoursePlanEntry["subject"] } | null>(null);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<CoursePlanEntry["level"]>("regular");

  const gpa = gpaFrom(coursePlan);
  const advanced = coursePlan.filter((c) => c.level === "ap" || c.level === "ib").length;
  const planned = coursePlan.filter(
    (c) => (c.level === "ap" || c.level === "ib") && c.status !== "completed"
  ).length;

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <p className="label-caps mb-1">Unweighted GPA</p>
          <p className="text-[1.4rem] font-semibold">{gpa.unweighted ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="label-caps mb-1">Weighted GPA</p>
          <p className="text-[1.4rem] font-semibold">{gpa.weighted ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="label-caps mb-1">Rigor read</p>
          <p className="text-[0.9rem] leading-snug">
            {advanced} AP/IB total ({planned} still ahead).{" "}
            {advanced >= 6
              ? "That's competitive for most selective schools."
              : advanced >= 3
                ? "A solid arc — depth in your strong subjects matters more than count."
                : "Room to add rigor where you're strongest — one subject at a time."}
          </p>
        </Card>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[720px] text-[0.88rem] border-collapse">
          <thead>
            <tr>
              <th className="label-caps text-left py-2 pr-3 w-28">Subject</th>
              {GRADES.map((g) => (
                <th key={g} className="label-caps text-left py-2 pr-3">{g}th</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUBJECTS.map((subject) => (
              <tr key={subject} className="border-t border-hairline align-top">
                <td className="py-3 pr-3 font-medium">{subject}</td>
                {GRADES.map((year) => {
                  const cell = coursePlan.filter((c) => c.year === year && c.subject === subject);
                  const isAdding = adding?.year === year && adding?.subject === subject;
                  return (
                    <td key={year} className="py-3 pr-3">
                      <div className="space-y-1.5">
                        {cell.map((c) => (
                          <div key={c.id} className="group border border-hairline bg-surface rounded-[3px] px-2.5 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={c.status === "planned" ? "text-gray-mid" : ""}>
                                {c.name}
                              </span>
                              <button
                                onClick={() => removeCourse(c.id)}
                                aria-label={`Remove ${c.name}`}
                                className="opacity-0 group-hover:opacity-100 text-gray-mid hover:text-ink text-[0.8rem]"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[0.7rem] uppercase tracking-[0.06em] text-gray-mid">
                                {c.level}{c.status === "planned" ? " · planned" : c.status === "in-progress" ? " · now" : ""}
                              </span>
                              {c.status === "completed" ? (
                                <select
                                  value={c.grade ?? ""}
                                  onChange={(e) => updateCourse(c.id, { grade: e.target.value || undefined })}
                                  aria-label={`Grade for ${c.name}`}
                                  className="text-[0.75rem] border border-hairline rounded-[2px] bg-surface outline-none"
                                >
                                  <option value="">—</option>
                                  {Object.keys(gradePoints).map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  onClick={() =>
                                    updateCourse(c.id, {
                                      status: c.status === "planned" ? "in-progress" : "completed",
                                    })
                                  }
                                  className="text-[0.7rem] text-gray-mid hover:text-ink underline underline-offset-2"
                                >
                                  {c.status === "planned" ? "start" : "finish"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {isAdding ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!newName.trim()) return;
                              addCourse({
                                id: `c-${Date.now()}`,
                                year,
                                subject,
                                name: newName.trim(),
                                level: newLevel,
                                status: "planned",
                              });
                              setNewName("");
                              setNewLevel("regular");
                              setAdding(null);
                            }}
                            className="space-y-1"
                          >
                            <input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder="Course name"
                              autoFocus
                              className="w-full border border-hairline rounded-[2px] bg-surface px-2 py-1 text-[0.82rem] outline-none focus:border-ink"
                            />
                            <div className="flex gap-1">
                              <select
                                value={newLevel}
                                onChange={(e) => setNewLevel(e.target.value as CoursePlanEntry["level"])}
                                className="flex-1 border border-hairline rounded-[2px] bg-surface text-[0.78rem] outline-none"
                              >
                                <option value="regular">Regular</option>
                                <option value="honors">Honors</option>
                                <option value="ap">AP</option>
                                <option value="ib">IB</option>
                              </select>
                              <button type="submit" className="text-[0.78rem] font-medium px-2">Add</button>
                              <button type="button" onClick={() => setAdding(null)} className="text-[0.78rem] text-gray-mid px-1">✕</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            onClick={() => setAdding({ year, subject })}
                            className="text-[0.78rem] text-gray-mid hover:text-ink transition-quiet"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ————— Activities tab ————— */

function ActivitiesTab() {
  const { activities, addActivity, updateActivity, removeActivity } = useApp();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-4 bg-accent-soft border-accent/30">
        <p className="text-[0.92rem] leading-relaxed">
          Depth beats breadth — I&apos;ll say it every time. Three activities
          with growth and responsibility read better than nine memberships.
          This log feeds your applications automatically senior year.
        </p>
      </Card>
      {activities.map((a) => (
        <Card key={a.id} className="p-5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <p className="font-semibold">
                {a.name}
                {a.leadership && (
                  <span className="ml-2 text-[0.7rem] uppercase tracking-[0.08em] text-accent font-medium">
                    Leadership
                  </span>
                )}
              </p>
              <p className="text-[0.85rem] text-gray-mid">
                {a.role} · {a.hoursPerWeek} hr/wk · {a.weeksPerYear} wk/yr · grades{" "}
                {a.yearsInvolved.join(", ") || "—"}
              </p>
            </div>
            <button
              onClick={() => removeActivity(a.id)}
              aria-label={`Remove ${a.name}`}
              className="text-gray-mid hover:text-ink"
            >
              ✕
            </button>
          </div>
          <textarea
            value={a.description}
            onChange={(e) => updateActivity(a.id, { description: e.target.value })}
            rows={2}
            aria-label={`Description for ${a.name}`}
            placeholder="What did you actually do? Specifics beat titles."
            className="w-full border border-hairline rounded-[3px] bg-surface p-2.5 text-[0.9rem] leading-relaxed outline-none focus:border-ink resize-none mt-2"
          />
          <button
            onClick={() => updateActivity(a.id, { leadership: !a.leadership })}
            className="text-[0.78rem] text-gray-mid hover:text-ink underline underline-offset-2 mt-1"
          >
            {a.leadership ? "Unmark leadership" : "Mark as leadership role"}
          </button>
        </Card>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          addActivity({
            id: `a-${Date.now()}`,
            name: name.trim(),
            role: role.trim(),
            hoursPerWeek: 2,
            weeksPerYear: 30,
            description: "",
            yearsInvolved: [],
            leadership: false,
          } satisfies Activity);
          setName("");
          setRole("");
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Activity"
          aria-label="Activity name"
          className="flex-1 min-w-[140px] border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Your role"
          aria-label="Your role"
          className="flex-1 min-w-[120px] border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
        />
        <Button variant="outline" type="submit">Add</Button>
      </form>
    </div>
  );
}

/* ————— Opportunities tab ————— */

function OpportunitiesTab() {
  const [freeOnly, setFreeOnly] = useState(false);
  const [type, setType] = useState<string>("");

  const shown = useMemo(() => {
    const order = { free: 0, stipend: 1, "low-cost": 2, paid: 3 };
    return opportunities
      .filter((o) => (!freeOnly || o.cost === "free" || o.cost === "stipend"))
      .filter((o) => (!type || o.type === type))
      .sort((a, b) => order[a.cost] - order[b.cost]);
  }, [freeOnly, type]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <Chip active={freeOnly} onClick={() => setFreeOnly((v) => !v)}>
          Free or paid-to-you only
        </Chip>
        {["program", "internship", "research", "job", "volunteering"].map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(type === t ? "" : t)}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {shown.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="font-semibold leading-snug">{o.name}</p>
              <span
                className={`text-[0.7rem] uppercase tracking-[0.08em] font-medium whitespace-nowrap ${
                  o.cost === "free" || o.cost === "stipend" ? "text-target" : "text-gray-mid"
                }`}
              >
                {o.cost === "stipend" ? "Pays you" : o.cost.replace("-", " ")}
              </span>
            </div>
            <p className="label-caps mb-2">
              {o.org} · {o.location}
              {o.selective ? " · selective" : ""}
            </p>
            <p className="text-[0.9rem] text-gray-strong leading-relaxed">{o.description}</p>
          </Card>
        ))}
      </div>
      <p className="text-[0.85rem] text-gray-mid mt-6 max-w-2xl">
        A note on paid programs: cost rarely equals admissions value. The free
        and selective ones signal more; the self-started ones often signal most.
      </p>
    </div>
  );
}

/* ————— Page ————— */

export default function PlannerPage() {
  const { mode } = useApp();
  const [tab, setTab] = useState<Tab>("courses");
  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionLabel className="mb-3">Planner</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          {mode === "build" ? (
            <>
              <em>What should I be doing?</em> That&apos;s the right question.
            </>
          ) : (
            <>
              <em>Your record so far</em> — and what&apos;s still ahead.
            </>
          )}
        </TwoTone>
      </div>
      <div
        role="tablist"
        aria-label="Planner sections"
        className="flex gap-1 overflow-x-auto no-scrollbar border-b border-hairline mb-8"
      >
        {(
          [
            ["courses", "Course plan"],
            ["activities", "Activity log"],
            ["opportunities", "Summer & opportunities"],
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
      {tab === "courses" && <CoursesTab />}
      {tab === "activities" && <ActivitiesTab />}
      {tab === "opportunities" && <OpportunitiesTab />}
    </div>
  );
}
