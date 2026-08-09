# Northstar

An AI college counselor for high school students and their parents. Honest expectations, a realistic list, and a process that feels navigable — for the ~95% of families who can't hire a private counselor.

## Status

**Foundation pass (Pass 1) complete:**

- Design system — Swiss/editorial tokens, type scale, UI primitives
- Navigation shell — desktop header + mobile bottom tabs, grade-aware mode label
- Landing page (logged out)
- Conversational onboarding — student & parent branches, ends with an editable "here's what I'm hearing" profile summary
- Typed domain model (`lib/types.ts`)
- Seed data: 40 colleges with full fields (`lib/data/schools.ts`)
- AI service stub (`lib/counselor.ts`) — all model calls behind one typed module with mock responses; swap in real APIs by editing this one file

Remaining passes: Counselor chat · School explorer · School detail · My list · Application manager · Dashboard · Planner · Interview prep · Decision center · Parent mode pass · Mobile polish.

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
