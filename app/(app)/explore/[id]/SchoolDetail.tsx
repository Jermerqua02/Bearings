"use client";

/* School detail — editorial, profile-specific.
   "How it fits you" leads. The city is first-class.
   Net price, not sticker, is the headline number.

   The school is resolved in page.tsx (a server component) and handed down,
   so an unknown id becomes a real 404 instead of a 200 with an apology. */

import { useEffect, useMemo, useState } from "react";
import SchoolPhoto from "@/components/school/SchoolPhoto";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import { whyThisSchoolAction } from "@/lib/actions/counselor";
import { formatDollars, formatRate, hasCostData } from "@/lib/format";
import { chanceRead, fit, nextDeadline } from "@/lib/match";
import { useApp } from "@/lib/profile-context";
import type { School } from "@/lib/types";

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

export default function SchoolDetail({ school }: { school: School }) {
  const { profile, list, addToList, removeFromList, markViewed } = useApp();
  const student = profile?.role === "student" ? profile : null;
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    markViewed(school.id);
  }, [school.id, markViewed]);

  useEffect(() => {
    let live = true;
    if (student) {
      void whyThisSchoolAction(school.id).then((t) => {
        if (live) setWhy(t);
      });
    }
    return () => {
      live = false;
    };
  }, [student, school.id]);

  const read = useMemo(
    () => (student ? chanceRead(student, school) : null),
    [student, school]
  );
  const tier = read?.tier ?? null;
  const f = useMemo(
    () => (student ? fit(student, school) : null),
    [student, school]
  );

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

  // Only the bands this school actually reported.
  const incomeBands = (
    [
      ["Under $48k", income.under48k],
      ["$48k – $75k", income.k48to75],
      ["$75k – $110k", income.k75to110],
      ["Over $110k", income.over110k],
    ] as [string, number | undefined][]
  ).filter((entry): entry is [string, number] => entry[1] != null);

  // Every fact appears when we have it, for every school. Nothing here asks
  // where the school came from — only whether the answer is known.
  const cityFacts = (
    [
      school.cityInfo.costOfLiving
        ? (["Cost of living", school.cityInfo.costOfLiving.replace("-", " ")] as const)
        : null,
      ["Getting around", school.cityInfo.transit] as const,
      ["Airport access", school.cityInfo.airportAccess] as const,
      ["Jobs & internships", school.cityInfo.internshipMarket] as const,
    ].filter(Boolean) as (readonly [string, string])[]
  ).filter(([, value]) => value);

  // The life section is worth showing if any single part of it is known.
  const hasLife =
    !!school.life.vibe ||
    !!school.life.weather ||
    !!school.life.commonComplaints ||
    !!school.life.religiousAffiliation ||
    school.life.greekLifePresence != null ||
    school.life.d1Athletics != null ||
    school.life.housingGuaranteed != null;

  return (
    <div className="animate-fade-up max-w-4xl">
      {/* Hero */}
      <div className="relative -mx-5 md:mx-0 mb-8">
        <SchoolPhoto schoolId={school.id} name={school.name} className="md:rounded-[3px] aspect-[2/1] md:aspect-[3/1]" />
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

      {/* How it fits you */}
      {student && (
        <Card className="p-6 md:p-8 mb-10 border-accent/30 bg-accent-soft">
          <SectionLabel className="mb-3 !text-accent">
            How it fits you
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
          <Stat
            label="Acceptance rate"
            value={
              school.admissions.acceptanceRate == null
                ? "Not reported"
                : formatRate(school.admissions.acceptanceRate)
            }
          />
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
        {/* Each plot appears only where the school published a range. A
            missing range is not a range of zero, and drawing one against a
            student's real number would be inventing the comparison. */}
        {(school.admissions.gpaMid50 || school.admissions.satMid50) && (
          <div className="space-y-5 max-w-xl">
            {school.admissions.gpaMid50 && (
              <RangePlot
                label="GPA (unweighted)"
                min={school.admissions.gpaMid50[0]}
                max={school.admissions.gpaMid50[1]}
                value={student?.gpa.unweighted}
                domain={[2.5, 4.0]}
              />
            )}
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
        )}
        {read?.caveat && (
          <p className="text-[0.85rem] text-gray-mid mt-4 max-w-xl">{read.caveat}</p>
        )}
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
        {hasCostData(school.cost) ? (
          <>
            <div className="grid sm:grid-cols-3 gap-6 mb-5">
              <Stat
                label="What you'd likely pay"
                value={estimate == null ? "Not reported" : `~${formatDollars(estimate)} / yr`}
              />
              <Stat
                label="Average net price"
                value={
                  school.cost.avgNetPrice == null
                    ? "Not reported"
                    : `${formatDollars(school.cost.avgNetPrice)} / yr`
                }
              />
              <Stat
                label="Sticker price"
                value={
                  school.cost.stickerPrice == null
                    ? "Not reported"
                    : `${formatDollars(school.cost.stickerPrice)} / yr`
                }
              />
            </div>
            {incomeBands.length > 0 && (
              <Card className="p-5 max-w-xl">
                <p className="label-caps mb-3">Average net price by family income</p>
                <table className="w-full text-[0.9rem]">
                  <tbody>
                    {incomeBands.map(([band, price]) => (
                      <tr key={band} className="border-t border-hairline first:border-t-0">
                        <td className="py-2 text-gray-strong">{band}</td>
                        <td className="py-2 text-right font-medium">
                          {formatDollars(price)} / yr
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {school.cost.percentNeedMet != null && (
                  <p className="text-[0.8rem] text-gray-mid mt-3">
                    Meets {formatRate(school.cost.percentNeedMet)} of demonstrated
                    need on average
                    {school.cost.meritAid ? ` · merit aid: ${school.cost.meritAid}` : ""}.
                    &quot;Need&quot; is what the aid formulas say your family
                    can&apos;t pay — we&apos;ll help you check their math.
                  </p>
                )}
              </Card>
            )}
          </>
        ) : (
          <p className="body-copy max-w-xl">
            This school hasn&apos;t reported cost figures to the federal data
            set we use. Its net price calculator — every college is required to
            publish one — will give you a real number for your family.
          </p>
        )}
      </section>

      {/* Academics */}
      <section className="mb-10">
        <SectionLabel className="mb-4">Academics</SectionLabel>
        {/* researchOpportunities and coOp are false by default, so printing
            "Limited" / "Standard" for an imported school would state a
            schema default as a finding. Shown only where we know. */}
        <div className="grid sm:grid-cols-3 gap-6 mb-4">
          {school.academics.studentFacultyRatio && (
            <Stat label="Student : faculty" value={school.academics.studentFacultyRatio} />
          )}
          {school.academics.researchOpportunities != null && (
            <Stat
              label="Research access"
              value={
                school.academics.researchOpportunities
                  ? "Yes — real opportunities"
                  : "Limited"
              }
            />
          )}
          {school.academics.coOp != null && (
            <Stat
              label="Co-op / internships"
              value={school.academics.coOp ? "Structured program" : "Standard"}
            />
          )}
        </div>
        {school.academics.topMajors.length > 0 && (
          <p className="text-[0.95rem] text-gray-strong mb-2">
            <span className="text-ink font-medium">Popular majors:</span>{" "}
            {school.academics.topMajors.join(" · ")}
          </p>
        )}
        {school.academics.notablePrograms.length > 0 && (
          <p className="text-[0.95rem] text-gray-strong">
            <span className="text-ink font-medium">Worth knowing:</span>{" "}
            {school.academics.notablePrograms.join(" · ")}
          </p>
        )}
      </section>

      {/* Life & culture — each line appears when that fact is known, whoever
          supplied it. Greek life and housing are null rather than 'low' and 0
          for a school nobody has assessed, so absence reads as absence. */}
      {hasLife && (
        <section className="mb-10">
          <SectionLabel className="mb-4">Life &amp; culture</SectionLabel>
          {school.life.vibe && <p className="body-copy text-ink mb-4">{school.life.vibe}.</p>}
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[0.92rem] max-w-2xl">
            {school.life.greekLifePresence && (
              <p><span className="text-gray-mid">Greek life:</span> {school.life.greekLifePresence}</p>
            )}
            {school.life.d1Athletics != null && (
              <p><span className="text-gray-mid">D1 athletics:</span> {school.life.d1Athletics ? "Yes" : "No"}</p>
            )}
            {school.life.housingGuaranteed != null && (
              <p><span className="text-gray-mid">Housing guaranteed:</span> {school.life.housingGuaranteed} year{school.life.housingGuaranteed === 1 ? "" : "s"}</p>
            )}
            {school.life.weather && (
              <p><span className="text-gray-mid">Weather:</span> {school.life.weather}</p>
            )}
            {school.life.religiousAffiliation && (
              <p><span className="text-gray-mid">Affiliation:</span> {school.life.religiousAffiliation}</p>
            )}
          </div>
          {school.life.commonComplaints && (
            <p className="text-[0.9rem] text-gray-strong mt-4 max-w-2xl">
              <span className="text-ink font-medium">What students complain about:</span>{" "}
              {school.life.commonComplaints}. Every school has this list — knowing it
              beforehand is the difference between a dealbreaker and a shrug.
            </p>
          )}
        </section>
      )}

      {/* The city — first-class section */}
      {cityFacts.length > 0 && (
        <section className="mb-10">
          <SectionLabel className="mb-4">
            The city — you&apos;re choosing a place to live, not just a school
          </SectionLabel>
          <div className="grid sm:grid-cols-2 gap-4">
            {cityFacts.map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="label-caps mb-1.5">{label}</p>
                <p className="text-[0.92rem] leading-relaxed">{value}</p>
              </Card>
            ))}
          </div>
          {school.cityInfo.thingsToDo && (
            <p className="text-[0.95rem] text-gray-strong mt-4 max-w-2xl">
              {school.cityInfo.thingsToDo}.
            </p>
          )}
        </section>
      )}

      {/* Outcomes */}
      {(school.outcomes.gradRate != null ||
        school.outcomes.medianEarnings10yr != null) && (
        <section className="mb-12">
          <SectionLabel className="mb-4">Outcomes</SectionLabel>
          <div className="grid sm:grid-cols-3 gap-6">
            {school.outcomes.gradRate != null && (
              <Stat
                label="Six-year grad rate"
                value={formatRate(school.outcomes.gradRate)}
              />
            )}
            {school.outcomes.medianEarnings10yr != null && (
              <Stat
                label="Median earnings (10 yr out)"
                value={formatDollars(school.outcomes.medianEarnings10yr)}
              />
            )}
            {school.outcomes.alumniNetwork && (
              <Stat label="Alumni network" value={school.outcomes.alumniNetwork} />
            )}
          </div>
        </section>
      )}

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
