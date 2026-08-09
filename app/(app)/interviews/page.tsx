"use client";

/* Interview prep — mock interviews with the counselor, per school.
   Text-based for v1; the UI leaves room for voice later. */

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { type InterviewFeedback } from "@/lib/counselor";
import { interviewTurnAction } from "@/lib/actions/counselor";
import { getSchool } from "@/lib/data/schools";
import { useApp } from "@/lib/profile-context";
import type { School } from "@/lib/types";

const COMMON_QUESTIONS = [
  "Tell me about yourself.",
  "Why are you interested in this school?",
  "What do you do outside of class — and why that?",
  "Tell me about a challenge you worked through.",
  "What would you add to our campus community?",
  "What are you reading, watching, or making right now?",
];

function schoolOffersInterview(s: School): boolean {
  return s.type !== "public" && s.type !== "public-flagship" && s.admissions.acceptanceRate < 0.6;
}

interface Turn {
  question: string;
  answer: string;
  feedback: InterviewFeedback;
}

export default function InterviewsPage() {
  const { profile, list } = useApp();
  const student = profile?.role === "student" ? profile : null;

  const interviewSchools = useMemo(
    () =>
      list
        .map((e) => getSchool(e.schoolId))
        .filter((s): s is School => !!s && schoolOffersInterview(s)),
    [list]
  );

  const [schoolId, setSchoolId] = useState<string>("");
  const school = schoolId ? (getSchool(schoolId) ?? null) : null;
  const [question, setQuestion] = useState(COMMON_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(true);

  const submit = async () => {
    if (!student || !answer.trim() || busy) return;
    setBusy(true);
    const fb = await interviewTurnAction({ schoolId: school?.id ?? null, question, answer });
    setTurns((prev) => [...prev, { question, answer, feedback: fb }]);
    setAnswer("");
    const next = fb.followUp.match(/"([^"]+)"/)?.[1];
    if (next) setQuestion(next);
    setBusy(false);
  };

  return (
    <div className="animate-fade-up max-w-3xl">
      <div className="mb-8">
        <SectionLabel className="mb-3">Interviews</SectionLabel>
        <TwoTone as="h1" size="lg">
          <em>Practice the conversation</em> before it counts.
        </TwoTone>
      </div>

      {/* Primer */}
      {primerOpen && (
        <Card className="p-6 mb-8">
          <div className="flex items-start justify-between gap-3">
            <SectionLabel className="mb-3">
              What interviews are actually for
            </SectionLabel>
            <button
              onClick={() => setPrimerOpen(false)}
              className="text-[0.8rem] text-gray-mid hover:text-ink"
            >
              Hide
            </button>
          </div>
          <div className="body-copy space-y-3 text-[0.95rem]">
            <p>
              Most students think an interview is an oral exam. It isn&apos;t.
              At nearly every school it&apos;s a low-stakes conversation, often
              with an alum, that answers one question:{" "}
              <span className="text-ink">
                is this a real person who would be good to have around?
              </span>
            </p>
            <p>
              A great interview isn&apos;t polished — it&apos;s specific. One
              real story about your robotics team beats five rehearsed
              paragraphs about leadership. Interviews rarely rescue or sink an
              application; mostly they confirm the person on paper exists. So
              your job is simple: be that person, out loud.
            </p>
          </div>
        </Card>
      )}

      {/* Setup */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="block">
          <span className="label-caps block mb-1.5">Practice for</span>
          <select
            value={schoolId}
            onChange={(e) => {
              setSchoolId(e.target.value);
              setTurns([]);
            }}
            className="border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
          >
            <option value="">General practice</option>
            {interviewSchools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[240px]">
          <span className="label-caps block mb-1.5">Question</span>
          <select
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full border border-hairline rounded-[3px] bg-surface px-3 h-10 text-[0.92rem] outline-none focus:border-ink"
          >
            {[question, ...COMMON_QUESTIONS.filter((q) => q !== question)].map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Past turns */}
      <div className="space-y-5 mb-6">
        {turns.map((t, i) => (
          <div key={i}>
            <p className="text-[0.95rem] font-medium mb-1">{t.question}</p>
            <p className="text-[0.92rem] text-gray-strong border-l-2 border-hairline pl-3 mb-3 whitespace-pre-wrap">
              {t.answer}
            </p>
            <Card className="p-4">
              <div className="grid sm:grid-cols-2 gap-4 text-[0.88rem]">
                <div>
                  <p className="label-caps mb-1.5 !text-target">Working</p>
                  {t.feedback.strengths.map((s) => (
                    <p key={s} className="leading-relaxed mb-1">— {s}</p>
                  ))}
                </div>
                <div>
                  <p className="label-caps mb-1.5">To work on</p>
                  {t.feedback.toWorkOn.map((s) => (
                    <p key={s} className="leading-relaxed mb-1">— {s}</p>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Answer box */}
      <div>
        <p className="text-[1.05rem] font-medium mb-3">{question}</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={5}
          placeholder="Answer as if you're speaking. Don't polish — talk."
          aria-label="Your interview answer"
          className="w-full border border-hairline rounded-[3px] bg-surface p-4 text-[1rem] leading-relaxed outline-none focus:border-ink transition-quiet resize-y"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-[0.8rem] text-gray-mid">
            Voice practice is coming — for now, typing it out builds the same muscle.
          </p>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !answer.trim()}>
            {busy ? "Listening…" : "Get feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
