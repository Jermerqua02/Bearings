"use client";

/* School detail — editorial, profile-specific.
   "Why this might be right for you" leads. The city is first-class.
   Net price, not sticker, is the headline number. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SchoolPhoto from "@/components/school/SchoolPhoto";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import { whyThisSchoolAction } from "@/lib/actions/counselor";
import { getSchool } from "@/lib/data/schools";
import { chanceTier, fit, nextDeadline } from "@/lib/match";
import { useApp } from "@/lib/profile-context";

/* Student's number plotted against the school's mid-50% range. */
function RangePlot({
  label,
  min,
  max,
  value,
  domain,
}: {
  label: string;
  min: number;
  max: number;
  value?: number;
  domain: [number, number];
}) {
  const pct = (v: number) =>
    Math.min(100, Math.max(0, ((v - domain[0]) / (domain[1] - domain[0])) * 100));
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="label-caps">{label}</span>
        <span className="text-[0.8rem] text-gray-mid">
          mid-50%: {min}–{max}
          {value !== undefined && ` · you: ${value}`}
        </span>
      </div>
      <div className="relative h-2 bg-fill rounded-full">
        <div
          className="absolute h-full bg-hairline rounded-full"
          style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
        />
        {value !== undefined && (
          <div
            className="absolute -top-[3px] w-3.5 h-3.5 rounded-full bg-accent border-2 border-paper"
            style={{ left: `calc(${pct(value)}% - 7px)` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-caps mb-1">{label}</p>
      <p className="text-[1.05rem] font-medium">{value}</p>
    </div>
  );
}

export default function SchoolDetailPage() {
  const params = useParams<{ id: string }>();
  const school = getSchool(params.id);
  const { profile, list, addToList, removeFromList, markViewed } = useApp();
  const student = profile?.role === "student" ? profile : null;
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    if (school) markViewed(school.id);
  }, [school, markViewed]);

  useEffect(() => {
    let live = true;
    if (student && school) {
      void whyThisSchoolAction(school.id).then((t) => {
        if (live) setWhy(t);
      });
    }
    return () => {
      live = false;
    };
  }, [student, school]);

  const tier = useMemo(
    () => (student && school ? chanceTier(student, school) : null),
    [student, school]
  );
  const f = useMemo(
    () => (student && school ? fit(student, school) : null),
    [student, school]
  );

  if (!school) {
    return (
      <p className="body-copy">
        School not found.{" "}
        <Link href="/explore" className="underline underline-offset-2 text-ink">
          Back to the explorer
        </Link>
        .
      </p>
    );
  }

  const onList = list.some((e) => e.schoolId === school.id);
  const deadline = nextDeadline(school);
  const income = school.cost.netPriceByIncome;
  const budget = student?.budget.maxPerYear;
  const estimate =
    budget === undefined
      ? school.cost.avgNetPrice
      : budget <= 30000
        ? income.k48to75
        : budget <= 50000
          ? income.k75to110
          : income.over110k;

  return (
    <div className="animate-fade-up max-w-4xl">
      {/* Hero */}
      <div className="relative -mx-5 md:mx-0 mb-8">
        <SchoolPhoto name={school.name} className="md:rounded-[3px] aspect-[2/1] md:aspect-[3/1]" />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <SectionLabel className="mb-2">
            {school.city}, {school.state} · {school.undergradEnrollment.toLocaleString()} undergrads
          </SectionLabel>
          <h1 className="headline-lg">{school.name}</h1>
        </div>
        <div className="flex items-center gap-3 pt-2">
          {tier && <TierBadge tier={tier} />}
          <Button
            variant={onList ? "ghost" : "primary"}
            onClick={() =>
              onList
                ? removeFromList(school.id)
                : addToList({
                    schoolId: school.id,
                    tier: tier ?? "target",
                    status: "considering",
                  })
            }
          >
            {onList ? "Remove from list" : "Save to list"}
          </Button>
        </div>
      </div>

      {/* Why this might be right for you */}
      {student && (
        <Card className="p-6 md:p-8 mb-10 border-accent/30 bg-accent-soft">
          <SectionLabel className="mb-3 !text-accent">
            Why this might be right for you
          </SectionLabel>
          <p className="text-[1.1rem] leading-relaxed">
            {why ?? "Reading your profile…"}
          </p>
          {f && f.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {f.reasons.map((r) => (
                <span key={r} className="px-3 py-1 rounded-full bg-surface border border-hairline text-[0.82rem] text-gray-strong">
                  {r}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Admissions */}
      <section className="mb-10">
        <SectionLabel className="mb-4">Admissions</SectionLabel>
        <div className="grid sm:grid-cols-3 gap-6 mb-6">
          <Stat label="Acceptance rate" value={`${Math.round(school.admissions.acceptanceRate * 100)}%`} />
          <Stat
            label="Test policy"
            value={
              school.admissions.testPolicy === "blind"
                ? "Test-blind (scores not considered)"
                : school.admissions.testPolicy === "optional"
                  ? "Test-optional (your choice)"
                  : "Tests required"
            }
          />
          <Stat
            label="Next deadline"
            value={
              deadline
                ? `${deadline.plan} · ${deadline.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
                : "See school site"
            }
          />
        </div>
        <div className="space-y-5 max-w-xl">
          <RangePlot
            label="GPA (unweighted)"
            min={school.admissions.gpaMid50[0]}
            max={school.admissions.gpaMid50[1]}
            value={student?.gpa.unweighted}
            domain={[2.5, 4.0]}
          />
          {school.admissions.satMid50 && (
            <RangePlot
              label="SAT"
              min={school.admissions.satMid50[0]}
              max={school.admissions.satMid50[1]}
              value={student?.testScores.sat}
              domain={[800, 1600]}
            />
          )}
        </div>
        {tier === "reach" && (
          <p className="text-[0.9rem] text-gray-strong mt-4 max-w-xl">
            For students with your profile, this is a reach — and that&apos;s
            fine. Reaches belong on a list that&apos;s built on a solid
            foundation of targets and likelies.
          </p>
        )}
      </section>

      {/* Cost */}
      <section className="mb-10">
        <SectionLabel className="mb-4">Cost — honestly</SectionLabel>
        <div className="grid sm:grid-cols-3 gap-6 mb-5">
          <Stat label="What you'd likely pay" value={`~$${estimate.toLocaleString()} / yr`} />
          <Stat label="Average net price" value={`$${school.cost.avgNetPrice.toLocaleString()} / yr`} />
          <Stat label="Sticker price" value={`$${school.cost.stickerPrice.toLocaleString()} / yr`} />
        </div>
        <Card className="p-5 max-w-xl">
          <p className="label-caps mb-3">Average net price by family income</p>
          <table className="w-full text-[0.9rem]">
            <tbody>
              {(
                [
                  ["Under $48k", income.under48k],
                  ["$48k – $75k", income.k48to75],
                  ["$75k – $110k", income.k75to110],
                  ["Over $110k", income.over110k],
                ] as const
              ).map(([band, price]) => (
                <tr key={band} className="border-t border-hairline first:border-t-0">
                  <td className="py-2 text-gray-strong">{band}</td>
                  <td className="py-2 text-right font-medium">
                    ${price.toLocaleString()} / yr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[0.8rem] text-gray-mid mt-3">
            Meets {Math.round(school.cost.percentNeedMet * 100)}% of demonstrated
            need on average · merit aid: {school.cost.meritAid}. &quot;Need&quot;
            is what the aid formulas say your family can&apos;t pay — we&apos;ll
            help you check their math.
          </p>
        </Card>
      </section>

      {/* Academics */}
      <section className="mb-10">
        <SectionLabel className="mb-4">Academics</SectionLabel>
        <div className="grid sm:grid-cols-3 gap-6 mb-4">
          <Stat label="Student : faculty" value={school.academics.studentFacultyRatio} />
          <Stat label="Research access" value={school.academics.researchOpportunities ? "Yes — real opportunities" : "Limited"} />
          <Stat label="Co-op / internships" value={school.academics.coOp ? "Structured program" : "Standard"} />
        </div>
        <p className="text-[0.95rem] text-gray-strong mb-2">
          <span className="text-ink font-medium">Popular majors:</span>{" "}
          {school.academics.topMajors.join(" · ")}
        </p>
        <p className="text-[0.95rem] text-gray-strong">
          <span className="text-ink font-medium">Worth knowing:</span>{" "}
          {school.academics.notablePrograms.join(" · ")}
        </p>
      </section>

      {/* Life & culture */}
      <section className="mb-10">
        <SectionLabel className="mb-4">Life &amp; culture</SectionLabel>
        <p className="body-copy text-ink mb-4">{school.life.vibe}.</p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[0.92rem] max-w-2xl">
          <p><span className="text-gray-mid">Greek life:</span> {school.life.greekLifePresence}</p>
          <p><span className="text-gray-mid">D1 athletics:</span> {school.life.d1Athletics ? "Yes" : "No"}</p>
          <p><span className="text-gray-mid">Housing guaranteed:</span> {school.life.housingGuaranteed} year{school.life.housingGuaranteed === 1 ? "" : "s"}</p>
          <p><span className="text-gray-mid">Weather:</span> {school.life.weather}</p>
          {school.life.religiousAffiliation && (
            <p><span className="text-gray-mid">Affiliation:</span> {school.life.religiousAffiliation}</p>
          )}
        </div>
        <p className="text-[0.9rem] text-gray-strong mt-4 max-w-2xl">
          <span className="text-ink font-medium">What students complain about:</span>{" "}
          {school.life.commonComplaints}. Every school has this list — knowing it
          beforehand is the difference between a dealbreaker and a shrug.
        </p>
      </section>

      {/* The city — first-class section */}
      <section className="mb-10">
        <SectionLabel className="mb-4">
          The city — you&apos;re choosing a place to live, not just a school
        </SectionLabel>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              ["Cost of living", school.cityInfo.costOfLiving.replace("-", " ")],
              ["Getting around", school.cityInfo.transit],
              ["Airport access", school.cityInfo.airportAccess],
              ["Jobs & internships", school.cityInfo.internshipMarket],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="label-caps mb-1.5">{label}</p>
              <p className="text-[0.92rem] leading-relaxed">{value}</p>
            </Card>
          ))}
        </div>
        <p className="text-[0.95rem] text-gray-strong mt-4 max-w-2xl">
          {school.cityInfo.thingsToDo}.
        </p>
      </section>

      {/* Outcomes */}
      <section className="mb-12">
        <SectionLabel className="mb-4">Outcomes</SectionLabel>
        <div className="grid sm:grid-cols-3 gap-6">
          <Stat label="Six-year grad rate" value={`${Math.round(school.outcomes.gradRate * 100)}%`} />
          <Stat label="Median earnings (10 yr out)" value={`$${school.outcomes.medianEarnings10yr.toLocaleString()}`} />
          <Stat label="Alumni network" value={school.outcomes.alumniNetwork} />
        </div>
      </section>

      {/* Ask the counselor */}
      <Card className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[1rem]">
          Questions about {school.shortName}? I know your profile — ask me
          anything about fit, chances, or cost.
        </p>
        <Button href={`/counselor?school=${school.id}`} variant="primary">
          Ask the counselor
        </Button>
      </Card>
    </div>
  );
}
