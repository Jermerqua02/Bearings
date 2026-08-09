"use client";

/* Onboarding — conversational, not a form.
   One question at a time, full-screen, generous type, visible progress.
   This should feel like the first meeting with a counselor. */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import { summarizeProfileAction } from "@/lib/actions/counselor";
import { useApp } from "@/lib/profile-context";
import type {
  GradeLevel,
  ParentProfile,
  Profile,
  Region,
  StudentProfile,
  StudentValue,
} from "@/lib/types";

/* ————————————— Answer state ————————————— */

interface Answers {
  role?: "student" | "parent";
  firstName?: string;
  grade?: GradeLevel;
  gpaUnweighted?: string;
  gpaWeighted?: string;
  apCount?: string;
  honorsCount?: string;
  testChoice?: "sat" | "act" | "not-yet";
  testScore?: string;
  majors?: string[];
  activities?: string;
  regions?: Region[];
  settings?: string[];
  budget?: string;
  fafsa?: boolean;
  values?: StudentValue[];
  relationship?: string;
  priorities?: string[];
  worry?: string;
  involvement?: string;
}

const MAJORS = [
  "Undecided — still exploring",
  "Engineering",
  "Computer Science",
  "Biology / Pre-med",
  "Business",
  "Psychology",
  "English / Writing",
  "History / Politics",
  "Art / Design",
  "Performing Arts",
  "Nursing / Health",
  "Education",
  "Environmental Science",
];

const REGIONS: { id: Region; label: string }[] = [
  { id: "northeast", label: "Northeast" },
  { id: "mid-atlantic", label: "Mid-Atlantic" },
  { id: "south", label: "South" },
  { id: "midwest", label: "Midwest" },
  { id: "southwest", label: "Southwest" },
  { id: "west", label: "West" },
  { id: "northwest", label: "Northwest" },
];

const SETTINGS = ["Urban", "Suburban", "College town", "Rural"];

const BUDGETS = [
  "Under $15k / year",
  "$15k – $30k / year",
  "$30k – $50k / year",
  "$50k+ / year",
  "Honestly, not sure yet",
];

const VALUES: { id: StudentValue; label: string }[] = [
  { id: "research-access", label: "Research access" },
  { id: "co-op-internships", label: "Co-op / internship pipeline" },
  { id: "study-abroad", label: "Study abroad" },
  { id: "mental-health-support", label: "Mental-health support" },
  { id: "diversity", label: "Diversity" },
  { id: "lgbtq-friendly", label: "LGBTQ+ friendly" },
  { id: "greek-life", label: "Greek life" },
  { id: "d1-sports", label: "D1 sports" },
  { id: "religious-affiliation", label: "Religious community" },
  { id: "political-climate", label: "Political climate fit" },
];

const PRIORITIES = [
  "Affordability",
  "Academic strength",
  "Career outcomes",
  "Staying close to home",
  "My student's happiness",
  "Safety",
];

/* ————————————— Step definitions ————————————— */

type StepId =
  | "role"
  | "name"
  | "grade"
  | "gpa"
  | "rigor"
  | "testing"
  | "majors"
  | "activities"
  | "regions"
  | "settings"
  | "budget"
  | "values"
  | "relationship"
  | "p-grade"
  | "p-budget"
  | "priorities"
  | "worry"
  | "involvement"
  | "summary";

function stepsFor(role?: "student" | "parent"): StepId[] {
  const start: StepId[] = role ? [] : ["role"];
  if (role === "parent")
    return [
      ...start,
      "name",
      "relationship",
      "p-grade",
      "p-budget",
      "priorities",
      "worry",
      "involvement",
      "summary",
    ];
  return [
    ...start,
    "name",
    "grade",
    "gpa",
    "rigor",
    "testing",
    "majors",
    "activities",
    "regions",
    "settings",
    "budget",
    "values",
    "summary",
  ];
}

/* ————————————— Small inputs ————————————— */

function TextField(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
  label?: string;
}) {
  return (
    <label className="block">
      {props.label && (
        <span className="label-caps block mb-2">{props.label}</span>
      )}
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        className="w-full max-w-md border-b border-hairline bg-transparent text-[1.5rem] md:text-[2rem] font-medium py-2 focus:border-ink outline-none placeholder:text-gray-mid/60 transition-quiet"
      />
    </label>
  );
}

function ChipGroup<T extends string>(props: {
  options: { id: T; label: string }[];
  selected: T[];
  onToggle: (id: T) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2.5 max-w-2xl">
      {props.options.map((o) => (
        <Chip
          key={o.id}
          active={props.selected.includes(o.id)}
          onClick={() => props.onToggle(o.id)}
          aria-pressed={props.selected.includes(o.id)}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/* ————————————— Profile assembly ————————————— */

function buildProfile(a: Answers): Profile {
  if (a.role === "parent") {
    const p: ParentProfile = {
      role: "parent",
      firstName: a.firstName || "there",
      relationship: a.relationship || "parent",
      studentGrade: a.grade ?? 11,
      budgetPerYear: budgetToNumber(a.budget),
      priorities: a.priorities ?? [],
      biggestWorry: a.worry || "",
      involvementLevel:
        a.involvement === "Hands-on"
          ? "hands-on"
          : a.involvement === "Light touch"
            ? "light-touch"
            : "regular-check-ins",
    };
    return p;
  }
  const undecided =
    !a.majors?.length || a.majors.includes("Undecided — still exploring");
  const s: StudentProfile = {
    role: "student",
    firstName: a.firstName || "there",
    gradeLevel: a.grade ?? 11,
    gpa: {
      unweighted: a.gpaUnweighted ? Number(a.gpaUnweighted) : undefined,
      weighted: a.gpaWeighted ? Number(a.gpaWeighted) : undefined,
    },
    rigor: {
      apCount: a.apCount ? Number(a.apCount) : 0,
      ibCount: 0,
      honorsCount: a.honorsCount ? Number(a.honorsCount) : 0,
    },
    testScores: {
      sat:
        a.testChoice === "sat" && a.testScore ? Number(a.testScore) : undefined,
      act:
        a.testChoice === "act" && a.testScore ? Number(a.testScore) : undefined,
      planningToTest: a.testChoice !== "not-yet",
    },
    intendedMajors: undecided
      ? []
      : (a.majors ?? []).filter((m) => m !== "Undecided — still exploring"),
    undecided,
    activities: a.activities
      ? [
          {
            id: "onboarding-1",
            name: "From onboarding",
            role: "",
            hoursPerWeek: 0,
            weeksPerYear: 0,
            description: a.activities,
            yearsInvolved: [],
            leadership: false,
          },
        ]
      : [],
    geography: { regions: a.regions ?? [] },
    campus: {
      sizes: [],
      settings: (a.settings ?? []).map(
        (s) =>
          (s === "College town" ? "college-town" : s.toLowerCase()) as
            | "urban"
            | "suburban"
            | "college-town"
            | "rural"
      ),
    },
    budget: {
      maxPerYear: budgetToNumber(a.budget),
      willFileFafsa: a.fafsa ?? true,
    },
    values: a.values ?? [],
  };
  return s;
}

function budgetToNumber(b?: string): number | undefined {
  switch (b) {
    case "Under $15k / year":
      return 15000;
    case "$15k – $30k / year":
      return 30000;
    case "$30k – $50k / year":
      return 50000;
    case "$50k+ / year":
      return 90000;
    default:
      return undefined;
  }
}

/* ————————————— The flow ————————————— */

function OnboardingFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { setProfile } = useApp();

  const initialRole =
    params.get("role") === "student" || params.get("role") === "parent"
      ? (params.get("role") as "student" | "parent")
      : undefined;

  const [answers, setAnswers] = useState<Answers>({ role: initialRole });
  const [stepIndex, setStepIndex] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const steps = useMemo(() => stepsFor(answers.role), [answers.role]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const set = (patch: Partial<Answers>) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  const toggle = <K extends "majors" | "regions" | "settings" | "values" | "priorities">(
    key: K,
    id: string
  ) => {
    setAnswers((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return { ...prev, [key]: next };
    });
  };

  const goNext = async () => {
    const nextIndex = stepIndex + 1;
    if (steps[nextIndex] === "summary") {
      setLoadingSummary(true);
      const profile = buildProfile(answers);
      const text = await summarizeProfileAction();
      setSummary(text);
      setLoadingSummary(false);
    }
    setStepIndex(nextIndex);
  };

  const goBack = () => {
    if (stepIndex === 0) router.push("/");
    else setStepIndex(stepIndex - 1);
  };

  const finish = () => {
    setProfile(buildProfile(answers));
    router.push("/dashboard");
  };

  /* Per-step content */
  const content = (() => {
    switch (step) {
      case "role":
        return {
          prompt: "First things first — who am I talking to?",
          valid: !!answers.role,
          body: (
            <ChipGroup
              options={[
                { id: "student" as const, label: "I'm a student" },
                { id: "parent" as const, label: "I'm a parent" },
              ]}
              selected={answers.role ? [answers.role] : []}
              onToggle={(id) => set({ role: id })}
            />
          ),
        };
      case "name":
        return {
          prompt:
            answers.role === "parent"
              ? "Welcome. What should I call you?"
              : "Let's start easy. What should I call you?",
          valid: !!answers.firstName?.trim(),
          body: (
            <TextField
              value={answers.firstName ?? ""}
              onChange={(v) => set({ firstName: v })}
              placeholder="Your first name"
              autoFocus
            />
          ),
        };
      case "grade":
        return {
          prompt: `Nice to meet you, ${answers.firstName}. What grade are you in?`,
          valid: !!answers.grade,
          body: (
            <ChipGroup
              options={[9, 10, 11, 12].map((g) => ({
                id: String(g),
                label: `${g}th grade`,
              }))}
              selected={answers.grade ? [String(answers.grade)] : []}
              onToggle={(id) => set({ grade: Number(id) as GradeLevel })}
            />
          ),
        };
      case "gpa":
        return {
          prompt:
            "What's your GPA? Rough numbers are fine — we can refine later.",
          note: "Unweighted is on a 4.0 scale. If your school weights honors/AP classes, add that too.",
          valid: !!answers.gpaUnweighted,
          body: (
            <div className="space-y-6">
              <TextField
                label="Unweighted (out of 4.0)"
                value={answers.gpaUnweighted ?? ""}
                onChange={(v) => set({ gpaUnweighted: v })}
                placeholder="3.6"
                type="text"
                autoFocus
              />
              <TextField
                label="Weighted — optional"
                value={answers.gpaWeighted ?? ""}
                onChange={(v) => set({ gpaWeighted: v })}
                placeholder="4.1"
                type="text"
              />
            </div>
          ),
        };
      case "rigor":
        return {
          prompt: "How many advanced courses have you taken (or are in now)?",
          note: "Colleges read rigor in the context of what your school offers. There's no magic number.",
          valid: answers.apCount !== undefined || answers.honorsCount !== undefined,
          body: (
            <div className="space-y-6">
              <TextField
                label="AP or IB courses"
                value={answers.apCount ?? ""}
                onChange={(v) => set({ apCount: v })}
                placeholder="0"
                autoFocus
              />
              <TextField
                label="Honors courses"
                value={answers.honorsCount ?? ""}
                onChange={(v) => set({ honorsCount: v })}
                placeholder="0"
              />
            </div>
          ),
        };
      case "testing":
        return {
          prompt: "Where are you with the SAT or ACT?",
          note: "Plenty of strong schools are test-optional. Not having a score yet is a normal answer.",
          valid: !!answers.testChoice,
          body: (
            <div className="space-y-6">
              <ChipGroup
                options={[
                  { id: "sat" as const, label: "I have an SAT score" },
                  { id: "act" as const, label: "I have an ACT score" },
                  { id: "not-yet" as const, label: "Haven't tested yet" },
                ]}
                selected={answers.testChoice ? [answers.testChoice] : []}
                onToggle={(id) => set({ testChoice: id })}
              />
              {(answers.testChoice === "sat" || answers.testChoice === "act") && (
                <TextField
                  label={answers.testChoice === "sat" ? "SAT score" : "ACT score"}
                  value={answers.testScore ?? ""}
                  onChange={(v) => set({ testScore: v })}
                  placeholder={answers.testChoice === "sat" ? "1310" : "29"}
                />
              )}
            </div>
          ),
        };
      case "majors":
        return {
          prompt: "Any idea what you might want to study?",
          note: "“Undecided” is a first-class answer here. Most students change their minds anyway — being honest about it puts you ahead.",
          valid: (answers.majors?.length ?? 0) > 0,
          body: (
            <ChipGroup
              options={MAJORS.map((m) => ({ id: m, label: m }))}
              selected={answers.majors ?? []}
              onToggle={(id) => toggle("majors", id)}
              multi
            />
          ),
        };
      case "activities":
        return {
          prompt: "What do you actually spend time on outside class?",
          note: "Clubs, jobs, caring for family, art, sports, games you take seriously — all of it counts. Depth matters more than a long list.",
          valid: !!answers.activities?.trim(),
          body: (
            <textarea
              value={answers.activities ?? ""}
              onChange={(e) => set({ activities: e.target.value })}
              placeholder="e.g. Science Olympiad captain, part-time job at a vet clinic, teach myself guitar…"
              rows={4}
              autoFocus
              className="w-full max-w-2xl border border-hairline rounded-[3px] bg-surface p-4 text-[1.05rem] leading-relaxed focus:border-ink outline-none placeholder:text-gray-mid/60 transition-quiet resize-none"
            />
          ),
        };
      case "regions":
        return {
          prompt: "Where in the country would you consider living?",
          note: "Pick everything you're open to — casting wide here often surfaces great, less-obvious options.",
          valid: (answers.regions?.length ?? 0) > 0,
          body: (
            <ChipGroup
              options={REGIONS.map((r) => ({ id: r.id, label: r.label }))}
              selected={answers.regions ?? []}
              onToggle={(id) => toggle("regions", id)}
              multi
            />
          ),
        };
      case "settings":
        return {
          prompt: "What kind of place do you picture yourself in?",
          valid: (answers.settings?.length ?? 0) > 0,
          body: (
            <ChipGroup
              options={SETTINGS.map((s) => ({ id: s, label: s }))}
              selected={answers.settings ?? []}
              onToggle={(id) => toggle("settings", id)}
              multi
            />
          ),
        };
      case "budget":
      case "p-budget":
        return {
          prompt:
            step === "p-budget"
              ? "Let's talk about budget — honestly. What could your family put toward college each year?"
              : "What could your family realistically put toward college each year?",
          note: "This stays private and just helps me show you real net prices instead of scary sticker prices. Financial aid changes this math a lot.",
          valid: !!answers.budget,
          body: (
            <div className="space-y-6">
              <ChipGroup
                options={BUDGETS.map((b) => ({ id: b, label: b }))}
                selected={answers.budget ? [answers.budget] : []}
                onToggle={(id) => set({ budget: id })}
              />
              {answers.role !== "parent" && (
                <div>
                  <span className="label-caps block mb-2">
                    Planning to file the FAFSA (federal aid form)?
                  </span>
                  <ChipGroup
                    options={[
                      { id: "yes", label: "Yes / probably" },
                      { id: "no", label: "No" },
                    ]}
                    selected={[answers.fafsa === false ? "no" : "yes"]}
                    onToggle={(id) => set({ fafsa: id === "yes" })}
                  />
                </div>
              )}
            </div>
          ),
        };
      case "values":
        return {
          prompt: "Last one. What matters to you in a campus community?",
          valid: (answers.values?.length ?? 0) > 0,
          body: (
            <ChipGroup
              options={VALUES.map((v) => ({ id: v.id, label: v.label }))}
              selected={answers.values ?? []}
              onToggle={(id) => toggle("values", id)}
              multi
            />
          ),
        };
      case "relationship":
        return {
          prompt: "What's your relationship to your student?",
          valid: !!answers.relationship,
          body: (
            <ChipGroup
              options={["Mother", "Father", "Guardian", "Other family"].map(
                (r) => ({ id: r, label: r })
              )}
              selected={answers.relationship ? [answers.relationship] : []}
              onToggle={(id) => set({ relationship: id })}
            />
          ),
        };
      case "p-grade":
        return {
          prompt: "What grade is your student in?",
          valid: !!answers.grade,
          body: (
            <ChipGroup
              options={[9, 10, 11, 12].map((g) => ({
                id: String(g),
                label: `${g}th grade`,
              }))}
              selected={answers.grade ? [String(answers.grade)] : []}
              onToggle={(id) => set({ grade: Number(id) as GradeLevel })}
            />
          ),
        };
      case "priorities":
        return {
          prompt: "What matters most to you in this process?",
          valid: (answers.priorities?.length ?? 0) > 0,
          body: (
            <ChipGroup
              options={PRIORITIES.map((p) => ({ id: p, label: p }))}
              selected={answers.priorities ?? []}
              onToggle={(id) => toggle("priorities", id)}
              multi
            />
          ),
        };
      case "worry":
        return {
          prompt: "What's your biggest worry right now? Say it plainly.",
          note: "Whatever it is, you're almost certainly not alone in it.",
          valid: !!answers.worry?.trim(),
          body: (
            <textarea
              value={answers.worry ?? ""}
              onChange={(e) => set({ worry: e.target.value })}
              placeholder="e.g. That we can't afford the schools she's dreaming about…"
              rows={4}
              autoFocus
              className="w-full max-w-2xl border border-hairline rounded-[3px] bg-surface p-4 text-[1.05rem] leading-relaxed focus:border-ink outline-none placeholder:text-gray-mid/60 transition-quiet resize-none"
            />
          ),
        };
      case "involvement":
        return {
          prompt: "How involved do you want to be?",
          note: "The research is consistent: supported-but-not-managed students do best. Any of these can work.",
          valid: !!answers.involvement,
          body: (
            <ChipGroup
              options={["Light touch", "Regular check-ins", "Hands-on"].map(
                (o) => ({ id: o, label: o })
              )}
              selected={answers.involvement ? [answers.involvement] : []}
              onToggle={(id) => set({ involvement: id })}
            />
          ),
        };
      case "summary":
        return { prompt: "", valid: true, body: null };
    }
  })();

  /* ————— Summary screen ————— */
  if (step === "summary") {
    return (
      <div className="max-w-2xl mx-auto animate-fade-up">
        <SectionLabel className="mb-4">Your profile</SectionLabel>
        <h1 className="headline-md mb-8">
          Here&apos;s what I&apos;m hearing about you.
        </h1>
        <Card className="p-7 mb-6">
          {loadingSummary || summary === null ? (
            <p className="text-gray-mid">Putting this into words…</p>
          ) : (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={8}
              aria-label="Your profile summary — editable"
              className="w-full bg-transparent text-[1.05rem] leading-relaxed outline-none resize-none"
            />
          )}
        </Card>
        <p className="text-[0.9rem] text-gray-mid mb-8">
          This is editable — correct anything I got wrong. You can also update
          it anytime in Settings. It stays private to you.
        </p>
        <div className="flex gap-3">
          <Button variant="primary" size="lg" onClick={finish}>
            That&apos;s me — let&apos;s go
          </Button>
          <Button variant="ghost" size="lg" onClick={goBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  /* ————— Question screen ————— */
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10 max-w-xs">
        <ProgressBar steps={steps.length} index={stepIndex} />
      </div>
      <div key={step} className="animate-fade-up">
        <h1 className="headline-md mb-3 max-w-2xl">{content.prompt}</h1>
        {"note" in content && content.note && (
          <p className="text-[0.95rem] text-gray-mid mb-8 max-w-xl leading-relaxed">
            {content.note}
          </p>
        )}
        {!("note" in content && content.note) && <div className="mb-8" />}
        <div className="mb-12">{content.body}</div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={goNext}
          disabled={!content.valid}
          className={!content.valid ? "opacity-40 pointer-events-none" : ""}
        >
          Continue
        </Button>
        <Button variant="ghost" size="lg" onClick={goBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

/* ————————————— Page shell ————————————— */

function ProgressBar({ steps, index }: { steps: number; index: number }) {
  const pct = Math.round((index / (steps - 1)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-[2px] bg-hairline w-full"
    >
      <div
        className="h-full bg-accent transition-quiet"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function OnboardingShell() {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-6 h-16">
        <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
          Northstar
        </Link>
        <span className="label-caps">First meeting</span>
      </header>
      <div className="flex-1 flex items-center px-5 md:px-6 py-12">
        <div className="w-full">
          <OnboardingFlow />
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <OnboardingShell />
    </Suspense>
  );
}
