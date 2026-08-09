# Northstar

An AI college counselor for high school students and their parents. Honest expectations, a realistic list, and a process that feels navigable — for the ~95% of families who can't hire a private counselor.

Operated by **Prompt LLC**.

## Status

Live at [bearings-web-production.up.railway.app](https://bearings-web-production.up.railway.app).

**Working end to end:** accounts and sessions (Better Auth, self-hosted), Postgres persistence, the real Claude counselor with server-side cost metering, the student/parent privacy boundary enforced in the query layer, Terms and Privacy with recorded consent, and an admin portal.

**The twelve product screens:** landing and conversational onboarding · counselor chat with inline cards · school explorer · school detail · my list with tiers and compare · application manager (tracker, universal profile, essay workspace, recommenders, deadlines, aid) · planner (course grid, activities, opportunity finder) · interview prep · decision center · student and parent dashboards · settings.

**Also working:** password reset by email (Resend), read-aloud with a Gemini voice and a live waveform, and budget alerts that fire on a threshold.

**Not yet:** real school data (still the seed set in `lib/data/schools.ts`), a cron schedule calling `/api/cron/budget-alert` (the endpoint exists; Railway cron is configured in the dashboard), live infrastructure cost (needs a project-scoped `RAILWAY_API_TOKEN`), map view, voice interviews.

## Run it

```bash
npm install
npm run db:up        # local Postgres in Docker — signup hangs without it
npm run db:migrate
npm run db:seed      # optional: a demo student, parent, and schools
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` first and read the notes in it — the database section in particular.

## Tests

Integration tests against a real database, not mocks. Start Postgres first.

```bash
npm run test:boundary     # the student/parent privacy boundary
npm run test:legal        # consent records and cost attribution
npm run test:onboarding   # onboarding actually persists
npm run test:admin        # admin queries, feedback, budget settings
npm run test:budget       # budget alert thresholds and suppression
npm run test:live         # end-to-end against the real Claude API (costs money)
```

## Operating it

Railway **does not auto-deploy from GitHub** — pushing to `main` ships nothing.

```bash
railway up --detach -s bearings-web         # deploy (~70s)
railway deployment list                     # what's actually running
```

Production Postgres has no public endpoint, so run database work inside the container:

```bash
railway ssh -s bearings-web "…"
```

Admin is granted out of band and is deliberately not self-assignable:

```bash
npm run admin:grant you@example.com
npm run admin:password you@example.com      # prompts, never takes the password as an argument
```

## Stack

Next.js (App Router) · React 19 · TypeScript · Tailwind v4 · Postgres via Drizzle · Better Auth · Anthropic SDK · Railway.

## Architecture notes

- `lib/auth/policy.ts` — the privacy boundary. Authorization resolves *before* data is fetched, and denies by default.
- `lib/counselor.ts` — the single AI boundary. Every call is metered in `lib/counselor/usage.ts`.
- `lib/db/queries/admin.ts` — admin reads. Counts, status, and money; never content.
- `lib/costs.ts` — unit economics (server-only). Formatters live in `lib/format.ts` so client components can use them without dragging the cost model into the browser.
- `lib/legal.ts` — company identity and document versions. Consent is stored per version.
- `app/(app)/` — authenticated shell. `app/(legal)/` — public documents. `app/admin/` — the portal.
- Design tokens in `app/globals.css` (Tailwind v4 `@theme`). One accent (ink blue), muted chance-tier colors, no red/yellow/green.

## Product rules (enforced in copy and UI)

- Never hype, never doom. No outcome guarantees, no fabricated testimonials, no gamification, no scores-out-of-100 for students.
- Net price, not sticker price, is the default number.
- The AI never writes a student's essay — it asks, reflects, critiques. The UI says so.
- Parents never see the student's private counselor chat or draft essays unless shared. Enforced in `lib/auth/policy.ts`, not just in copy.
- Admins see counts and money, never student content.

## Before a real launch

- **Have counsel review both documents** — most users are minors. The details are filled in (Prompt LLC, Washington law, King County venue), but the mailing address is a home address published on the open web; a registered agent or PO box does the same job.
- Set a **project-scoped** `RAILWAY_API_TOKEN` (not the account token) plus `RAILWAY_PROJECT_ID`, for live infrastructure cost on `/admin/usage`.
- Add a Railway cron hitting `/api/cron/budget-alert` with `Authorization: Bearer $CRON_SECRET`. Daily is plenty.
- Verify a Northstar domain in Resend so email stops coming from a personal one.
- Replace the seed school data.
