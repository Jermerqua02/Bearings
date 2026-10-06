"use client";

/* Academic & activity planner — the primary surface in Build mode.
   For underclassmen the job is shaping the profile, not searching schools. */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { opportunities } from "@/lib/data/opportunities";
import { readTranscriptAction } from "@/lib/actions/transcript";
import { formatBytes } from "@/lib/format";
// Shared with the server, which computes the same numbers for the counselor.
import { gpaFrom, gradePoints } from "@/lib/coursework";
import { COMMON_APP, orderActivities } from "@/lib/packet";
import { useApp } from "@/lib/profile-context";
import type {
  Activity,
  CoursePlanEntry,
  ExtractedCourse,
  GradeLevel,
  ReportedGpa,
  TranscriptFile,
} from "@/lib/types";

/** A reading held in the page while the student checks it over. */
interface Reading {
  transcriptId: string;
  courses: ExtractedCourse[];
  notes: string[];
  reportedGpa: ReportedGpa;
}

type Tab = "courses" | "activities" | "opportunities";

const SUBJECTS: CoursePlanEntry["subject"][] = [
  "English", "Math", "Science", "Social Studies", "Language", "Arts", "Elective",
];

const GRADES: GradeLevel[] = [9, 10, 11, 12];


/* ————— Transcript upload ————— */

/**
 * Upload a transcript, have it read, confirm what it found.
 *
 * The middle step is the point of the design. Typing four years of courses
 * into the grid below is the single most tedious thing this page asks for,
 * and a transcript already contains all of it — but a model reading a
 * scanned table gets things wrong, and what it is writing into is the
 * student's academic record. So nothing lands until they say so, and the
 * caveats the model raises are shown to them rather than logged.
 */
function TranscriptPanel() {
  const {
    transcripts,
    addTranscript,
    updateTranscript,
    removeTranscript,
    addCoursesFromTranscript,
  } = useApp();

  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "uploading" | "reading" | "adding">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  async function read(transcriptId: string, force: boolean) {
    setBusy("reading");
    setError(null);
    setStatus(null);
    try {
      const result = await readTranscriptAction(transcriptId, { force });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.looksLikeTranscript) {
        setError("That doesn't look like a transcript. Check you uploaded the right file.");
        return;
      }
      setReading({
        transcriptId,
        courses: result.courses,
        notes: result.notes,
        reportedGpa: result.reportedGpa,
      });
      setPicked(new Set(result.courses.map((_, i) => i)));
      updateTranscript(transcriptId, {
        courseCount: result.courses.length,
        reportedGpa: result.reportedGpa,
      });
    } catch (err) {
      console.error("[transcript]", err);
      setError("Something went wrong reading that file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("uploading");
    setError(null);
    setStatus(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/transcript", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "We couldn't save that file.");
        setBusy(null);
        return;
      }
      addTranscript(json as TranscriptFile);
      await read(json.id, true);
    } catch (err) {
      console.error("[transcript]", err);
      setError("The upload didn't go through. Check your connection and try again.");
      setBusy(null);
    }
  }

  async function addPicked() {
    if (!reading) return;
    setBusy("adding");
    setError(null);
    try {
      const chosen = reading.courses.filter((_, i) => picked.has(i));
      const result = await addCoursesFromTranscript(chosen);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReading(null);
      if (result.added.length === 0) {
        setStatus("Those were all on your plan already — nothing to add.");
        return;
      }
      // Say that the rigor counts moved. They feed the chance tiers on the
      // list, so changing them silently would be a change to the student's
      // reach/target/likely split that nobody announced.
      const rigor = result.rigor
        ? ` Your rigor is now ${result.rigor.apCount} AP, ${result.rigor.ibCount} IB, ${result.rigor.honorsCount} honors — the counselor and your chance estimates use this.`
        : "";
      setStatus(
        `Added ${result.added.length} course${result.added.length === 1 ? "" : "s"} below.${
          result.skipped ? ` ${result.skipped} were already there.` : ""
        }${rigor}`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="max-w-xl">
          <p className="font-semibold mb-1">Your transcript</p>
          <p className="text-[0.85rem] text-gray-mid leading-relaxed">
            Upload it and we&apos;ll read the coursework onto this page, so you
            aren&apos;t typing four years of classes by hand. The file stays
            here — yours to download whenever you need it, and never shown to a
            linked parent.
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset first, so choosing the same file twice still fires.
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            variant="primary"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
          >
            {busy === "uploading"
              ? "Uploading…"
              : busy === "reading"
                ? "Reading…"
                : "Upload a transcript"}
          </Button>
          <p className="text-[0.72rem] text-gray-mid mt-1.5 text-right">
            PDF or a photo, up to 15 MB
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[0.85rem] text-reach mb-3">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-[0.85rem] text-target mb-3">
          {status}
        </p>
      )}

      {transcripts.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {transcripts.map((t) => (
            <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[0.88rem] font-medium break-all">{t.filename}</span>
              <span className="label-caps">
                {formatBytes(t.sizeBytes)}
                {t.courseCount != null ? ` · ${t.courseCount} courses read` : " · not read yet"}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <a
                  href={`/api/transcript/${t.id}`}
                  className="text-[0.82rem] underline underline-offset-2 min-h-[38px] flex items-center"
                >
                  Download
                </a>
                <button
                  onClick={() => void read(t.id, true)}
                  disabled={busy !== null}
                  className="text-[0.82rem] text-gray-mid hover:text-ink underline underline-offset-2 min-h-[38px] disabled:opacity-40"
                >
                  {t.courseCount != null ? "Read again" : "Read it"}
                </button>
                <button
                  onClick={() => {
                    removeTranscript(t.id);
                    if (reading?.transcriptId === t.id) setReading(null);
                  }}
                  aria-label={`Remove ${t.filename}`}
                  className="text-[0.82rem] text-gray-mid hover:text-ink min-h-[38px] min-w-[38px]"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {reading && (
        <div className="mt-5 pt-5 border-t border-hairline">
          <p className="font-semibold text-[0.92rem] mb-1">
            {reading.courses.length === 0
              ? "We couldn't pick out any courses"
              : `We read ${reading.courses.length} course${reading.courses.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-[0.82rem] text-gray-mid mb-3 max-w-2xl leading-relaxed">
            Check these against the document before adding them — this is your
            academic record, and a scan is not always read correctly. Untick
            anything wrong; you can edit or delete any of it afterwards.
            {reading.courses.some((c) => c.term) && (
              <>
                {" "}
                A course you took all year appears once per grading period,
                with that period&apos;s own grade — those repeats are what the
                transcript says, not a mistake.
              </>
            )}
          </p>

          {reading.notes.length > 0 && (
            <ul className="text-[0.82rem] text-gray-strong mb-3 space-y-1 max-w-2xl">
              {reading.notes.map((n, i) => (
                <li key={i}>— {n}</li>
              ))}
            </ul>
          )}

          {reading.courses.length > 0 && (
            <>
              <div className="max-h-80 overflow-y-auto border border-hairline rounded-[3px] divide-y divide-hairline mb-3">
                {reading.courses.map((c, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(i)}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="text-[0.88rem]">{c.name}</span>
                      <span className="block text-[0.72rem] uppercase tracking-[0.06em] text-gray-mid">
                        {c.year}th · {c.subject} · {c.level}
                        {/* The term is what distinguishes two rows for the
                            same class — without it a semestered course reads
                            as a duplicate. */}
                        {c.term ? ` · ${c.term}` : ""}
                        {c.grade ? ` · ${c.grade}` : " · in progress"}
                        {c.credits ? ` · ${c.credits} cr` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void addPicked()} disabled={busy !== null || picked.size === 0}>
                  {busy === "adding"
                    ? "Adding…"
                    : `Add ${picked.size} course${picked.size === 1 ? "" : "s"}`}
                </Button>
                <button
                  onClick={() =>
                    setPicked(
                      picked.size === reading.courses.length
                        ? new Set()
                        : new Set(reading.courses.map((_, i) => i)),
                    )
                  }
                  className="text-[0.82rem] text-gray-mid hover:text-ink underline underline-offset-2"
                >
                  {picked.size === reading.courses.length ? "Untick all" : "Tick all"}
                </button>
                <button
                  onClick={() => setReading(null)}
                  className="text-[0.82rem] text-gray-mid hover:text-ink underline underline-offset-2"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ————— Courses tab ————— */

function CoursesTab() {
  const { coursePlan, transcripts, addCourse, removeCourse, updateCourse } = useApp();
  const [adding, setAdding] = useState<{ year: GradeLevel; subject: CoursePlanEntry["subject"] } | null>(null);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<CoursePlanEntry["level"]>("regular");

  const gpa = gpaFrom(coursePlan);

  /*
    The GPA a transcript prints for itself beats anything computed here.
    Schools exclude pass/fail work, weight by credit, count or ignore
    middle-school credit, and apply their own scale — a reconstruction from
    a course list will differ, and the first real upload differed by half a
    point. The number a student quotes to a college has to be the school's.
  */
  const reported = transcripts.find((t) => t.reportedGpa?.unweighted != null)?.reportedGpa;
  const advanced = coursePlan.filter((c) => c.level === "ap" || c.level === "ib").length;
  const planned = coursePlan.filter(
    (c) => (c.level === "ap" || c.level === "ib") && c.status !== "completed"
  ).length;

  return (
    <div>
      <TranscriptPanel />

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <p className="label-caps mb-1">Unweighted GPA</p>
          <p className="text-[1.4rem] font-semibold">
            {reported?.unweighted ?? gpa.unweighted ?? "—"}
          </p>
          {/* Three numbers can exist: the one printed on the transcript, the
              one averaged from the rows below, and the self-reported figure
              from onboarding. Saying which is on screen stops them reading
              as a contradiction — and the transcript's own is the one that
              goes on an application. */}
          <p className="text-[0.75rem] text-gray-mid mt-1 leading-snug">
            {reported?.unweighted != null ? (
              <>
                As printed on your transcript
                {reported.credits ? ` (over ${reported.credits} credits)` : ""}. This
                is the figure your school reports.
                {gpa.unweighted != null && Math.abs(gpa.unweighted - reported.unweighted) >= 0.05
                  ? ` Averaging the courses below gives ${gpa.unweighted} — schools count credits and exclude pass/fail work, so the two rarely match exactly.`
                  : ""}
              </>
            ) : (
              <>From the courses below. Chance estimates use the GPA you reported in onboarding.</>
            )}
          </p>
        </Card>
        <Card className="p-4">
          <p className="label-caps mb-1">Weighted GPA</p>
          <p className="text-[1.4rem] font-semibold">
            {reported?.weighted ?? gpa.weighted ?? "—"}
          </p>
          <p className="text-[0.75rem] text-gray-mid mt-1 leading-snug">
            {reported?.weighted != null
              ? "As printed on your transcript."
              : "Estimated from the courses below — AP and IB add a point, honors half."}
          </p>
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
                                /* Was opacity-0 until hover, which on a phone
                                   means never — there is no hover. Always
                                   visible, dimmed, with a real tap target. */
                                className="shrink-0 -my-1.5 -mr-2.5 px-2.5 py-1.5 min-h-[44px] min-w-[38px] flex items-center justify-center text-gray-mid hover:text-ink md:opacity-40 md:group-hover:opacity-100 transition-quiet"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[0.7rem] uppercase tracking-[0.06em] text-gray-mid">
                                {c.level}
                                {/* Two rows for the same class are two grading
                                    periods, not a duplicate. Say which. */}
                                {c.term ? ` · ${c.term}` : ""}
                                {c.status === "planned" ? " · planned" : c.status === "in-progress" ? " · now" : ""}
                              </span>
                              {c.status === "completed" ? (
                                <select
                                  value={c.grade ?? ""}
                                  onChange={(e) => updateCourse(c.id, { grade: e.target.value || undefined })}
                                  aria-label={`Grade for ${c.name}`}
                                  /* 16px: anything smaller makes iOS Safari
                                     zoom the viewport on focus. */
                                  className="text-[1rem] md:text-[0.8rem] min-h-[38px] px-1.5 border border-hairline rounded-[2px] bg-surface outline-none"
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
                                  aria-label={
                                    c.status === "planned"
                                      ? `Mark ${c.name} as in progress`
                                      : `Mark ${c.name} as completed`
                                  }
                                  className="text-[0.78rem] text-gray-mid hover:text-ink underline underline-offset-2 -my-2 py-2 px-1 -mx-1 min-h-[38px]"
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
                                aria-label="Course level"
                                className="flex-1 border border-hairline rounded-[2px] bg-surface text-[1rem] md:text-[0.8rem] min-h-[38px] px-1 outline-none"
                              >
                                <option value="regular">Regular</option>
                                <option value="honors">Honors</option>
                                <option value="ap">AP</option>
                                <option value="ib">IB</option>
                              </select>
                              <button type="submit" className="text-[0.8rem] font-medium px-3 min-h-[38px]">Add</button>
                              <button
                                type="button"
                                onClick={() => setAdding(null)}
                                aria-label="Cancel adding a course"
                                className="text-[0.8rem] text-gray-mid px-2.5 min-h-[38px]"
                              >
                                ✕
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            onClick={() => setAdding({ year, subject })}
                            aria-label={`Add a ${subject} course for ${year}`}
                            /* A bare "+" glyph was a ~7×12px target, and
                               announced as "plus" with no context. */
                            className="text-[0.9rem] text-gray-mid hover:text-ink transition-quiet min-h-[38px] min-w-[38px] flex items-center justify-center -ml-2"
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
  const { activities, addActivity, updateActivity, removeActivity, reorderActivities } =
    useApp();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  /* The student's own ranking where they've given one, entry order until then. */
  const ordered = orderActivities(activities);
  const move = (index: number, by: -1 | 1) => {
    const next = [...ordered];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    reorderActivities(next.map((a) => a.id));
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-4 bg-accent-soft border-accent/30">
        <p className="text-[0.92rem] leading-relaxed">
          Depth beats breadth — I&apos;ll say it every time. Three activities
          with growth and responsibility read better than nine memberships.
          This log feeds your applications automatically senior year.
        </p>
      </Card>
      {ordered.length > 1 && (
        <p className="text-[0.85rem] text-gray-mid">
          Applications ask for these in order of importance to you, and only the
          first {COMMON_APP.activitySlots} fit. Put the one you&apos;d talk about
          first at the top.
        </p>
      )}
      {ordered.map((a, i) => (
        <Card key={a.id} className="p-5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-start gap-3 min-w-0">
              {ordered.length > 1 && (
                <div className="flex flex-col items-center shrink-0 -mt-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${a.name} up`}
                    className="min-h-[28px] min-w-[32px] text-gray-mid hover:text-ink disabled:opacity-30 disabled:hover:text-gray-mid"
                  >
                    ▲
                  </button>
                  <span
                    className={`text-[0.75rem] tabular-nums ${
                      i < COMMON_APP.activitySlots ? "text-gray-mid" : "!text-reach"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label={`Move ${a.name} down`}
                    className="min-h-[28px] min-w-[32px] text-gray-mid hover:text-ink disabled:opacity-30 disabled:hover:text-gray-mid"
                  >
                    ▼
                  </button>
                </div>
              )}
              <div className="min-w-0">
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
                {i >= COMMON_APP.activitySlots && (
                  <p className="text-[0.78rem] !text-reach mt-0.5">
                    Past the {COMMON_APP.activitySlots}-slot limit — won&apos;t fit
                    on the application.
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => removeActivity(a.id)}
              aria-label={`Remove ${a.name}`}
              className="shrink-0 text-gray-mid hover:text-ink min-h-[44px] min-w-[44px] flex items-center justify-center -my-2 -mr-2"
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
          {/* The cut to 150 characters has to happen somewhere; better here,
              with time, than inside the real form on deadline day. */}
          <p
            className={`text-[0.75rem] tabular-nums text-right ${
              a.description.length > COMMON_APP.descriptionChars
                ? "!text-reach font-medium"
                : "text-gray-mid"
            }`}
          >
            {a.description.length}/{COMMON_APP.descriptionChars}
            {a.description.length > COMMON_APP.descriptionChars &&
              ` — ${a.description.length - COMMON_APP.descriptionChars} over`}
          </p>
          <button
            onClick={() => updateActivity(a.id, { leadership: !a.leadership })}
            aria-pressed={a.leadership}
            className="text-[0.8rem] text-gray-mid hover:text-ink underline underline-offset-2 mt-1 min-h-[38px] py-2 -my-1 self-start"
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
  const { mode, profile } = useApp();
  const [tab, setTab] = useState<Tab>("courses");

  /*
    A parent's course plan and activity log are empty by design — those are
    student-private, so the query layer never fetches them (lib/auth/policy.ts).
    The page didn't know that, and handed parents an editable, blank grid
    under the heading "What should I be doing?", which is a question they
    weren't asking about a record that isn't theirs.
  */
  if (profile?.role === "parent") {
    return (
      <div className="animate-fade-up max-w-xl">
        <SectionLabel className="mb-3">Planner</SectionLabel>
        <TwoTone as="h1" size="lg" className="mb-4">
          <em>This one belongs to your student.</em>
        </TwoTone>
        <p className="body-copy mb-4">
          Course choices and activities are the part of this process where
          being watched is least useful — so the planner stays theirs. It
          feeds their application profile automatically; nothing gets re-typed
          in senior year.
        </p>
        <p className="body-copy">
          What you can see is on{" "}
          <Link href="/dashboard" className="underline underline-offset-2 text-ink">
            your dashboard
          </Link>
          : their list, where each application stands, what&apos;s due next, and
          the aid comparison once offers arrive.
        </p>
      </div>
    );
  }

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
