# Northstar

An AI college counselor for high school students and their parents. Honest expectations, a realistic list, and a process that feels navigable — for the ~95% of families who can't hire a private counselor.

## Status

**All 12 screens built (mocked data, stubbed AI):**

- Landing page + conversational onboarding (student & parent branches, editable AI summary)
- Counselor — full-screen chat, rich inline cards, thread sidebar, editable "About you" panel, nudges
- School explorer — filter rail, sort, grid/list views, Counselor Picks, mobile bottom-sheet filters
- School detail — profile-specific "why this fits," your numbers plotted on mid-50% ranges, net-price-by-income, the city as a first-class section
- My list — drag-and-drop tier columns, balance meter, compare mode (up to 4)
- Application manager — tracker pipeline, universal profile, essay workspace with AI critique (never writes), recommenders, deadline timeline, aid tracker
- Planner — four-year course grid with GPA/rigor read, activity log, opportunity finder (free options first)
- Interview prep — primer, question banks, mock interview turns with feedback
- Decision center — calm decision tracker, true-cost aid comparison, appeal guidance, waitlist toolkit, choice worksheet, May 1 checklist
- Dashboard — separate student and parent variants, weekly check-in ritual with history
- Settings — parent linking with explicit privacy boundaries, notifications, JSON export, delete

Not yet: real AI (stubbed in `lib/counselor.ts`), real school data, persistence/auth, map view, voice interviews.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Stack

Next.js (App Router) · React 19 · TypeScript · Tailwind CSS v4. Client-side state only for now (React context, no persistence). All data mocked.

## Architecture notes

- `lib/counselor.ts` — the single AI boundary. Typed request/response. Replace `mockCounselor` with a real provider implementation; nothing else changes.
- `lib/profile-context.tsx` — session state: profile, grade mode, saved list.
- `lib/data/schools.ts` — one typed data module for all school seed data.
- `app/(app)/` — authenticated shell (nav + tabs). `app/page.tsx` is marketing.
- Design tokens live in `app/globals.css` (Tailwind v4 `@theme`). One accent (ink blue), muted chance-tier colors, no red/yellow/green.

## Product rules (enforced in copy and UI)

- Never hype, never doom. No outcome guarantees, no fabricated testimonials, no gamification, no scores-out-of-100 for students.
- Net price, not sticker price, is the default number.
- The AI never writes a student's essay — it asks, reflects, critiques. The UI says so.
- Parents never see the student's private counselor chat or draft essays unless shared. The UI shows this boundary explicitly.
