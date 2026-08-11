"use client";

/* Settings — privacy is a product surface here, not a policy page.
   Most users are minors; the controls are visible and real. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { useApp } from "@/lib/profile-context";

function Toggle({
  label,
  description,
  on,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex items-start justify-between gap-4 w-full text-left py-3"
    >
      <span>
        <span className="block text-[0.95rem] font-medium">{label}</span>
        <span className="block text-[0.85rem] text-gray-mid leading-relaxed mt-0.5">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={`mt-1 w-10 h-6 rounded-full p-0.5 transition-quiet shrink-0 ${
          on ? "bg-accent" : "bg-hairline"
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white transition-quiet ${
            on ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const {
    profile, updateProfile, parentLinked, setParentLinked,
    list, essays, activities, coursePlan, universal, resetAll,
  } = useApp();

  const [notifDeadlines, setNotifDeadlines] = useState(true);
  const [notifCheckIn, setNotifCheckIn] = useState(true);
  const [notifNudges, setNotifNudges] = useState(false);
  const [shareEssays, setShareEssays] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportData = () => {
    const payload = JSON.stringify(
      { profile, list, essays, activities, coursePlan, universal },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "northstar-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!profile) return null;

  const isParent = profile.role === "parent";

  return (
    <div className="animate-fade-up max-w-2xl space-y-10">
      <div>
        <SectionLabel className="mb-3">Settings</SectionLabel>
        <TwoTone as="h1" size="lg">
          <em>Your data, your boundaries.</em> Plainly stated.
        </TwoTone>
      </div>

      {/* Profile */}
      <section>
        <SectionLabel className="mb-4">Profile</SectionLabel>
        <Card className="p-5">
          <label className="block mb-4">
            <span className="label-caps block mb-1.5">First name</span>
            <input
              value={profile.firstName}
              onChange={(e) => updateProfile({ firstName: e.target.value })}
              className="w-full max-w-xs border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
            />
          </label>
          <p className="text-[0.85rem] text-gray-mid">
            {isParent
              ? "Your student's grades, scores and preferences live in their own profile — they own that, and it's what every estimate in here is calculated from."
              : "Grades, scores, and preferences live in the counselor's “About you” panel — editable any time, because the AI should know what you tell it, not what it assumes."}
          </p>
        </Card>
      </section>

      {/* Family linking */}
      <section>
        <SectionLabel className="mb-4">Family linking &amp; boundaries</SectionLabel>
        <Card className="p-5">
          {isParent ? (
            /*
              A parent used to be offered "Link a parent account" — a switch
              for themselves, backed by nothing: linking is student-initiated
              and lib/actions/linking.ts refuses a parent caller. Stating the
              boundary is the honest version of this card.
            */
            <>
              <p className="text-[0.95rem] mb-3">
                {parentLinked
                  ? "You're linked to your student's account."
                  : "You're not linked to a student account yet."}
              </p>
              <p className="text-[0.88rem] text-gray-strong leading-relaxed mb-3">
                {parentLinked
                  ? "You see their list, application statuses, deadlines, and the decision worksheet with aid offers. You don't see their counselor conversations or essay drafts unless they share one."
                  : "Your student sends the invitation from their own settings — linking only works in that direction, on purpose."}
              </p>
              <p className="text-[0.82rem] text-gray-strong bg-fill rounded-[3px] p-3 leading-relaxed">
                Why the boundary: this process only works if a student can
                think out loud without an audience. You get transparency about
                progress; they keep privacy about process. Both are
                load-bearing, and the second one is the part that&apos;s easy to
                underestimate.
              </p>
            </>
          ) : (
            <>
              <Toggle
                label={parentLinked ? "Parent account linked" : "Link a parent account"}
                description="A linked parent sees the shared view: your list, statuses, deadlines, and the decision worksheet with aid offers. Nothing else."
                on={parentLinked}
                onToggle={() => setParentLinked(!parentLinked)}
              />
              <div className="border-t border-hairline my-2" />
              <Toggle
                label="Share essay drafts"
                description="Off by default, and set per essay. Your counselor chats are never visible to a linked parent. A shared draft shows only revisions saved after you shared it."
                on={shareEssays}
                onToggle={() => setShareEssays(!shareEssays)}
              />
              <p className="text-[0.82rem] text-gray-strong bg-fill rounded-[3px] p-3 mt-3 leading-relaxed">
                Why the boundary: this process only works if you can think out
                loud without an audience. Parents get transparency about
                progress; you keep privacy about process. Both are
                load-bearing.
              </p>
            </>
          )}
        </Card>
      </section>

      {/* Notifications */}
      <section>
        <SectionLabel className="mb-4">Notifications</SectionLabel>
        <Card className="p-5">
          <Toggle
            label="Deadline reminders"
            description="14 days, 7 days, and 48 hours before anything is due."
            on={notifDeadlines}
            onToggle={() => setNotifDeadlines(!notifDeadlines)}
          />
          <div className="border-t border-hairline my-2" />
          <Toggle
            label="Weekly check-in"
            description="Your three things for the week, Monday mornings."
            on={notifCheckIn}
            onToggle={() => setNotifCheckIn(!notifCheckIn)}
          />
          <div className="border-t border-hairline my-2" />
          <Toggle
            label="Counselor nudges"
            description="Occasional observations between check-ins. Off is a fine choice."
            on={notifNudges}
            onToggle={() => setNotifNudges(!notifNudges)}
          />
        </Card>
      </section>

      {/* Data */}
      <section>
        <SectionLabel className="mb-4">Your data</SectionLabel>
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.95rem] font-medium">Export everything</p>
              <p className="text-[0.85rem] text-gray-mid">
                One JSON file: profile, list, essays, activities, course plan.
              </p>
            </div>
            <Button variant="outline" onClick={exportData}>Export</Button>
          </div>
          <div className="border-t border-hairline" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.95rem] font-medium">Delete account</p>
              <p className="text-[0.85rem] text-gray-mid">
                Removes everything, immediately. No retention, no &quot;archive.&quot;
              </p>
            </div>
            {confirmDelete ? (
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    resetAll();
                    router.push("/");
                  }}
                >
                  Confirm
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete…</Button>
            )}
          </div>
        </Card>
        <p className="text-[0.82rem] text-gray-mid leading-relaxed mt-4">
          We never sell or share student data. Not to colleges, not to
          advertisers, not to &quot;partners.&quot; Educational records are
          protected under FERPA and applicable state student-privacy laws
          (including SOPIPA-style statutes); our commitments here don&apos;t
          wait for a subpoena to matter. What you tell your counselor stays
          between you and your counselor.
        </p>
      </section>

      {/* The documents themselves were reachable only from the landing and
          sign-up pages — nowhere inside the product, for an audience that is
          mostly minors and their parents. */}
      <section>
        <SectionLabel className="mb-4">The documents</SectionLabel>
        <p className="text-[0.9rem] text-gray-strong leading-relaxed">
          You agreed to these when you signed up, and they&apos;re worth being
          able to find again:{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="text-ink underline underline-offset-4">
            Terms of Service
          </Link>
        </p>
      </section>
    </div>
  );
}
