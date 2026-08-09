/* Summer & opportunity seed data.
   Free and low-cost options listed FIRST, deliberately —
   this must never become a pay-to-play list. */

import type { Opportunity } from "@/lib/types";

export const opportunities: Opportunity[] = [
  {
    id: "o1",
    name: "Local hospital or clinic volunteering",
    org: "Your local health system",
    type: "volunteering",
    cost: "free",
    selective: false,
    location: "Everywhere",
    interests: ["medicine", "biology", "service"],
    description:
      "Unglamorous and genuinely valuable. Sustained volunteering at one place beats a week at three.",
  },
  {
    id: "o2",
    name: "A real summer job",
    org: "Any employer",
    type: "job",
    cost: "stipend",
    selective: false,
    location: "Everywhere",
    interests: ["work", "responsibility", "any"],
    description:
      "Admissions readers respect work. A lifeguard chair or a cash register teaches things a resume camp can't — and it pays you.",
  },
  {
    id: "o3",
    name: "Bank of America Student Leaders",
    org: "Bank of America",
    type: "internship",
    cost: "stipend",
    selective: true,
    location: "Major U.S. cities",
    interests: ["service", "leadership", "civic"],
    description:
      "Paid eight-week nonprofit internship plus a leadership summit in D.C. Free to apply, pays you.",
  },
  {
    id: "o4",
    name: "MIT PRIMES / PRIMES-USA",
    org: "MIT",
    type: "research",
    cost: "free",
    selective: true,
    location: "Remote + Boston",
    interests: ["math", "computer science", "research"],
    description:
      "Year-long mentored math/CS research for high schoolers. Free and very selective — the work is real.",
  },
  {
    id: "o5",
    name: "Research Science Institute (RSI)",
    org: "CEE / MIT",
    type: "research",
    cost: "free",
    selective: true,
    location: "Cambridge, MA",
    interests: ["science", "research", "stem"],
    description:
      "Fully free, extremely selective summer research program. Worth an application if your record is strong; never a plan A for anyone.",
  },
  {
    id: "o6",
    name: "Telluride Association Summer Seminar (TASS)",
    org: "Telluride Association",
    type: "program",
    cost: "free",
    selective: true,
    location: "University campuses",
    interests: ["humanities", "critical thinking", "writing"],
    description:
      "Free — including room and board — six-week humanities seminar. One of the best-kept secrets for readers and writers.",
  },
  {
    id: "o7",
    name: "Community college dual-enrollment course",
    org: "Your local community college",
    type: "program",
    cost: "low-cost",
    selective: false,
    location: "Everywhere",
    interests: ["any", "academics"],
    description:
      "Take a real college course in a subject your school doesn't offer. Cheap, transferable, and it shows initiative without a brand name.",
  },
  {
    id: "o8",
    name: "Girls Who Code Summer Immersion",
    org: "Girls Who Code",
    type: "program",
    cost: "free",
    selective: true,
    location: "Remote + cities",
    interests: ["computer science", "technology"],
    description: "Free two-week CS immersion with stipends available.",
  },
  {
    id: "o9",
    name: "NIH High School Summer Internship (HS-SIP)",
    org: "National Institutes of Health",
    type: "research",
    cost: "stipend",
    selective: true,
    location: "Bethesda, MD + labs nationwide",
    interests: ["biology", "medicine", "research"],
    description: "Paid biomedical research placement in working NIH labs.",
  },
  {
    id: "o10",
    name: "Start something small",
    org: "You",
    type: "program",
    cost: "free",
    selective: false,
    location: "Everywhere",
    interests: ["any", "initiative"],
    description:
      "A tutoring circle, a repair stand, a zine, a neighborhood survey. Self-started and sustained beats expensive and passive — and it's the best Throughline material there is.",
  },
  {
    id: "o11",
    name: "University pre-college programs (paid)",
    org: "Various universities",
    type: "program",
    cost: "paid",
    selective: false,
    location: "Campuses nationwide",
    interests: ["any", "campus life"],
    description:
      "Honest note: these are fine for trying campus life, but most carry little admissions weight relative to cost. Aid exists; ask before paying sticker.",
  },
  {
    id: "o12",
    name: "Governor's School (your state)",
    org: "State programs",
    type: "program",
    cost: "free",
    selective: true,
    location: "Your state",
    interests: ["any", "academics", "arts"],
    description:
      "Most states run free, selective summer programs in academics or arts. Underrated and near-free signal of ability.",
  },
];
