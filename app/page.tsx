import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";

/* Landing / marketing (logged out).
   Editorial, Swiss, calm. One value line, one CTA, two entry paths.
   No fake stats, no testimonials, no urgency — by design. */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center justify-between">
          <span className="text-[1.05rem] font-semibold tracking-tight">
            Northstar
          </span>
          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-[0.9rem] text-gray-strong hover:text-ink transition-quiet"
            >
              Sign in
            </Link>
            <Button href="/onboarding" variant="primary">
              Get started
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 md:px-6 pt-16 md:pt-28 pb-16 md:pb-24">
        <SectionLabel className="mb-6">
          An honest college counselor, always available
        </SectionLabel>
        <TwoTone as="h1" size="xl" className="max-w-4xl mb-8">
          <em>Your profile</em> deserves a list that&apos;s{" "}
          <em>as realistic as it is exciting.</em>
        </TwoTone>
        <p className="body-copy mb-10">
          A good counselor reads your actual grades, interests, and budget —
          then tells you the truth, kindly. Most families can&apos;t hire one.
          Northstar is that counselor: it knows your profile, remembers what
          you&apos;ve said, and gets more specific over time.
        </p>

        {/* Two entry paths */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button href="/onboarding?role=student" variant="primary" size="lg">
            I&apos;m a student
          </Button>
          <Button href="/onboarding?role=parent" variant="outline" size="lg">
            I&apos;m a parent
          </Button>
        </div>
      </section>

      {/* What a counselor actually does */}
      <section className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-16 md:py-24">
          <TwoTone as="h2" size="lg" className="max-w-3xl mb-12">
            Three things change everything. <em>A real counselor does all three.</em>
          </TwoTone>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                index: "01",
                title: "Honest expectations",
                body: "No hype, no doom. “This is a reach, and that’s fine — here’s how to build around it.” You always know where you actually stand.",
              },
              {
                index: "02",
                title: "A list that fits you",
                body: "Your grades, rigor, budget, geography, and values — translated into schools worth your time, including great ones you’ve never heard of.",
              },
              {
                index: "03",
                title: "A navigable process",
                body: "Deadlines, essays, recommendations, aid forms — sequenced into small, doable steps, so senior fall feels like a plan instead of a panic.",
              },
            ].map((item) => (
              <Card key={item.index} className="p-7">
                <span className="card-index">{item.index}</span>
                <h3 className="text-[1.15rem] font-semibold mt-4 mb-3">
                  {item.title}
                </h3>
                <p className="text-[0.98rem] leading-relaxed text-gray-strong">
                  {item.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Throughline */}
      <section className="border-t border-hairline bg-surface">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionLabel className="mb-4">The Throughline</SectionLabel>
            <TwoTone as="h2" size="lg" className="mb-6">
              <em>What&apos;s my story?</em> Not &quot;how do I beat other
              applicants.&quot;
            </TwoTone>
            <p className="body-copy">
              Northstar finds the thread connecting your courses, activities,
              and interests into one coherent story — the thing an admissions
              reader would remember. It&apos;s self-understanding, not a score.
              We will never grade you out of 100.
            </p>
          </div>
          <Card className="p-7 md:mt-10">
            <SectionLabel className="mb-4">Example</SectionLabel>
            <p className="text-[1rem] leading-relaxed mb-5">
              &quot;You turn curiosity into building. Your coursework, your
              robotics team, and the way you spend unstructured time all point
              at the same instinct — you don&apos;t just study subjects, you
              make things with them.&quot;
            </p>
            <div className="flex flex-wrap gap-2">
              {["3 years of robotics", "AP CS + Physics", "Self-taught web dev"].map(
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
        </div>
      </section>

      {/* Students & parents */}
      <section className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-16 md:py-24">
          <TwoTone as="h2" size="lg" className="max-w-3xl mb-12">
            Built for students. <em>Built for parents too</em> — differently.
          </TwoTone>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-7">
              <SectionLabel className="mb-4">For students</SectionLabel>
              <p className="text-[0.98rem] leading-relaxed text-gray-strong">
                Direct, encouraging, honest. Self-discovery, fit, and ownership
                of your own process. Your counselor conversations and essay
                drafts are private — always. Undecided about a major? Good.
                That&apos;s an honest place to start, and we treat it that way.
              </p>
            </Card>
            <Card className="p-7">
              <SectionLabel className="mb-4">For parents</SectionLabel>
              <p className="text-[0.98rem] leading-relaxed text-gray-strong">
                The admissions landscape is nothing like when you applied.
                Northstar explains it plainly, keeps costs and aid front and
                center, and coaches you on supporting without hovering. You see
                the list, statuses, and deadlines — never your student&apos;s
                private conversations. That boundary is a feature.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Money, honestly */}
      <section className="border-t border-hairline bg-surface">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <SectionLabel className="mb-4">Financial reality, early</SectionLabel>
            <TwoTone as="h2" size="lg" className="mb-6">
              Net price, <em>not sticker price.</em>
            </TwoTone>
            <p className="body-copy">
              An $88,000 sticker can cost a family less than their state
              flagship — or far more. Northstar shows what families like yours
              actually pay, at every school, from the first search to the final
              aid-offer comparison. No surprises in April.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-16 md:py-24 text-center">
          <TwoTone as="h2" size="lg" className="mb-8 mx-auto max-w-2xl">
            <em>Fifteen minutes</em> to a counselor who knows you.
          </TwoTone>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button href="/onboarding?role=student" variant="primary" size="lg">
              I&apos;m a student
            </Button>
            <Button href="/onboarding?role=parent" variant="outline" size="lg">
              I&apos;m a parent
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <span className="text-[0.9rem] text-gray-mid">Northstar</span>
          <p className="text-[0.8rem] text-gray-mid max-w-md">
            Most of our users are minors. We never sell or share student data —
            in the product, not just the terms.
          </p>
        </div>
      </footer>
    </div>
  );
}
