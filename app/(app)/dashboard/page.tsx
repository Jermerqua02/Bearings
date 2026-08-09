"use client";

import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import TwoTone from "@/components/ui/TwoTone";
import Button from "@/components/ui/Button";
import { getSchool } from "@/lib/data/schools";
import { useApp } from "@/lib/profile-context";
import { gradeModeLabel } from "@/lib/types";

export default function DashboardPage() {
  const { profile, mode, list } = useApp();

  if (!profile) return null;
  const firstName = profile.firstName;

  return (
    <div className="animate-fade-up space-y-10">
      <div>
        <SectionLabel className="mb-3">
          {gradeModeLabel[mode]} mode
        </SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>Hi {firstName}.</em> Here&apos;s where things stand.
        </TwoTone>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Counselor nudge */}
        <Card className="p-6 md:col-span-2">
          <SectionLabel className="mb-3">From your counselor</SectionLabel>
          <p className="text-[1.05rem] leading-relaxed">
            Your list is developing a healthy shape — but it&apos;s light on
            likely schools you&apos;d actually be excited about. That&apos;s the
            most common gap, and the most fixable one. Want to look at a few
            together?
          </p>
          <div className="mt-5">
            <Button href="/counselor" variant="primary">
              Open counselor
            </Button>
          </div>
        </Card>

        {/* List balance snapshot */}
        <Card className="p-6">
          <SectionLabel className="mb-3">List balance</SectionLabel>
          <ul className="space-y-3">
            {list.map((entry) => {
              const school = getSchool(entry.schoolId);
              if (!school) return null;
              return (
                <li
                  key={entry.schoolId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-[0.95rem] truncate">
                    {school.shortName}
                  </span>
                  <TierBadge tier={entry.tier} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Throughline */}
      {profile.role === "student" && (
        <Card className="p-6 md:p-8">
          <SectionLabel className="mb-3">Your Throughline</SectionLabel>
          <p className="body-copy text-ink">
            Your story is still forming — and that&apos;s exactly right for
            where you are. The early thread: you commit deeply to the things
            you choose, and science keeps pulling you back. Let&apos;s keep
            noticing.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            {["Science Olympiad captain", "Hospital volunteering", "AP science pairing"].map(
              (chip) => (
                <span
                  key={chip}
                  className="px-3 py-1 rounded-full bg-fill text-[0.85rem] text-gray-strong"
                >
                  {chip}
                </span>
              )
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
