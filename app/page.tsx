import Link from "next/link";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";

/* Landing / marketing (logged out).
   Gallery-editorial: oversized two-tone lead, full-bleed visual band,
   numbered stage rail. No fake stats, no testimonials, no urgency. */

const stages = [
  { n: "01", name: "Explore", href: "/explore", src: "/stage-explore.jpg" },
  { n: "02", name: "List", href: "/list", src: "/stage-list.jpg" },
  { n: "03", name: "Apply", href: "/apply", src: "/stage-apply.jpg" },
  { n: "04", name: "Decide", href: "/decide", src: "/stage-decide.jpg" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between">
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

      {/* Hero — oversized editorial lead */}
      <section className="max-w-[1400px] mx-auto px-5 md:px-10 pt-16 md:pt-28 pb-12 md:pb-16">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-3">
            <SectionLabel>An honest college counselor</SectionLabel>
            <div className="hidden lg:block mt-6 h-px bg-hairline" />
            <p className="hidden lg:block mt-6 text-[0.85rem] leading-relaxed text-gray-mid">
              Always available. Never grading you out of 100.
            </p>
          </div>
          <div className="lg:col-span-9">
            <TwoTone as="h1" size="xl" className="max-w-[24ch] lg:max-w-none">
              <em>Your profile deserves a list</em> that&apos;s as realistic as
              it is exciting — grades, budget, and geography read honestly, then
              translated into schools worth your time.
            </TwoTone>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Button href="/onboarding?role=student" variant="primary" size="lg">
                I&apos;m a student
              </Button>
              <Button href="/onboarding?role=parent" variant="outline" size="lg">
                I&apos;m a parent
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Full-bleed visual band */}
      <section className="pb-16 md:pb-24">
        <div className="w-full overflow-hidden bg-fill">
          <Image
            src="/hero-band.jpg"
            alt="Light-filled university library atrium"
            width={1920}
            height={820}
            priority
            sizes="100vw"
            className="w-full h-[46vh] md:h-[64vh] max-h-[680px] object-cover"
          />
        </div>
      </section>

      {/* Stage rail */}
      <section className="border-t border-hairline">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <SectionLabel className="mb-4">The path</SectionLabel>
              <TwoTone as="h2" size="lg" className="max-w-3xl">
                Four stages. <em>One plan you can actually follow.</em>
              </TwoTone>
            </div>
            <Link
              href="/dashboard"
              className="self-start md:self-end shrink-0 whitespace-nowrap px-6 py-2 border border-ink rounded-full text-[0.7rem] font-semibold uppercase tracking-[0.18em] hover:bg-ink hover:text-paper transition-quiet"
            >
              See all
            </Link>
          </div>

          <div className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar snap-x -mx-5 px-5 md:mx-0 md:px-0">
            {stages.map((s) => (
              <Link
                key={s.n}
                href={s.href}
                className="group shrink-0 w-[70vw] sm:w-[42vw] lg:w-[calc((100%-4.5rem)/4)] snap-start"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-fill border border-hairline">
                  <Image
                    src={s.src}
                    alt={s.name}
                    fill
                    sizes="(max-width: 640px) 70vw, (max-width: 1024px) 42vw, 25vw"
                    className="object-cover transition-transform duration-700 ease-quiet group-hover:scale-[1.04]"
                  />
                  <span className="absolute top-5 left-5 text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
                    {s.name}
                  </span>
                  <span className="absolute bottom-5 left-5 text-[0.7rem] text-gray-strong tabular-nums">
                    {s.n}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* What a counselor actually does */}
      <section className="border-t border-hairline">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
          <TwoTone as="h2" size="lg" className="max-w-3xl mb-12">
            Three things change everything. <em>A real counselor does all three.</em>
          </TwoTone>
          <div className="grid md:grid-cols-3 border-t border-hairline">
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
              <div
                key={item.index}
                className="pt-8 pb-10 border-b border-hairline md:border-b-0 md:pr-8 md:[&:not(:last-child)]:border-r md:[&:not(:first-child)]:pl-8"
              >
                <span className="card-index">{item.index}</span>
                <h3 className="text-[1.15rem] font-semibold mt-5 mb-3">
                  {item.title}
                </h3>
                <p className="text-[0.98rem] leading-relaxed text-gray-strong max-w-sm">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Throughline */}
      <section className="border-t border-hairline bg-surface">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-start">
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
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
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
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
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
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24 text-center">
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
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[0.9rem] text-gray-mid">Northstar</span>
            <span className="text-[0.8rem] text-gray-mid">
              Operated by Prompt LLC · ©{new Date().getFullYear()}
            </span>
          </div>
          <p className="text-[0.8rem] text-gray-mid max-w-md">
            Most of our users are minors. We never sell or share student data —
            in the product, not just the terms.
          </p>
          <nav className="flex items-center gap-5 text-[0.8rem] text-gray-mid">
            <Link href="/terms" className="hover:text-ink transition-quiet">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-quiet">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
