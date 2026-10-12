# Lumni Pro — plan

Status: **proposed, not built.** Written 2026-10-09 for approval before any code.
The model below is the chosen starting point; expect to tune it.

Lumni is a premium app. A free account can look schools up; everything that
is about **the student** — their chances, their real cost, the counselor — is
Pro. A school can buy Pro for its students, and a student who can't afford it
can ask for it free.

**The line: anyone can look up a school; Lumni tells you what it means for
you.** Free is what a college's own website would show. Pro is anything
personalized.

---

## 1. The offer

### The first minute: a trial with a card, right after onboarding

Onboarding ends on the paywall: **"Start your 7-day free trial."** It's
Apple's own introductory offer on Pro Monthly — the family confirms with
Face ID, nothing is charged for 7 days, and Apple bills $14.99 on day 8
unless they cancel. Trials that take a card up front convert several times
better than ones that don't, and because the trial is Apple's, App Review has
nothing to question.

The same screen offers the **Season Pass** ($99.99 for a year — Apple doesn't
offer trials on non-renewing purchases), **"Not now"** (continue on Free),
and **"Can't afford it? Request free access."**

On day 6 of the trial: **"Your week with Lumni"** — sessions practiced,
schools found, what WUE saves them — before Apple's renewal.

### Tiers

**Free — the public directory**

| | Free |
|---|---|
| Browse the **40 hand-written schools** (well-known, the fullest data), plus any school on their list | ✓ |
| School pages: **published** numbers — admit rate, sticker and average net price, test ranges, outcomes, deadlines | ✓ |
| Save a list | **up to 5 schools** |
| Deadline dates for saved schools | ✓ |
| Profile, courses, activities — entering and editing | ✓ |
| A sample of the counselor | **2 messages, once** — interview practice has no free sample |
| Linking a parent and student | ✓ — the link is how Pro is shared, so it can't be behind Pro |

**Pro — everything about you**

| Where | Pro |
|---|---|
| Chances | Your reach / target / likely on every school, and how you compare to the middle 50% |
| Real cost | Your price: out-of-state, WUE and other exchanges, your income band, "what you'd likely pay" |
| Fit | Fit labels, "Best fit" sorting, fit reasons, "How it fits you" |
| Counselor | Unlimited chat with memory; picks; Home's "From your counselor" and "This week"; tips and coaching lines; the parent view's guidance |
| Interviews | Unlimited voice practice, with history |
| Applications | Unlimited list, list balance, the full tracker — requirements, essays per school, recommendation letters, progress |
| Writing | Essay feedback, throughline |
| Transcript | Reading a transcript in from a photo |
| Reminders | Deadline push reminders and nudges |
| Family | What a parent sees through the link beyond the list and deadlines: costs, their student's chances, the season's guidance |
| Deciding | Side-by-side comparison, financial aid offer comparison |

**Locked looks like a preview, not a hole.** A locked card keeps its place
and title and says what's behind it — "Your chances at Purdue," "What Purdue
would cost you," "Your counselor's take" — and opens the paywall. On every
school, a free student sees exactly what Pro would tell them.

**Parents are accounts in their own right (2026-10-10).** A parent has
their own counselor (speaking to them as a parent, with their own private
conversations and notes), explores schools, and keeps a list of their own
apart from their student's. Free allowances are per parent: their own
2-message sample and their own 5-school list. Pro is still shared across
the link. Once linked, a parent sees their student's chances and fit on
every school, worked out on the server from the student's profile — the
grades themselves never reach the parent. Interview practice stays the
student's.

**Fair use, in practice (2026-10-11):** past 300 counselor messages in 30
days, replies come from Sonnet 5.5 instead of Opus 5.5 — nothing stops and
nothing is shown, the conversation just costs about half as much. A heavy
senior sends ~150 a month, so this protects the Season Pass margin without
anyone ordinary noticing (`FAIR_USE_CHATS_PER_30_DAYS` in
lib/actions/counselor.ts).

**Never locked, whatever the status:** the student's own data — their list
(all of it, if they saved more than 5 while on Pro), essays, transcript, past
practice — stays readable, and deadline dates stay visible. A student who
stops paying loses the personal tools, never their work.

### The mission, kept

"For the families who can't hire a private counselor" now rests on two doors,
both kept in plain sight:

- **Free access** — on the paywall and in Settings; 12 months of Pro,
  approved in the admin portal.
- **School licenses** — a counseling office buys Pro for its students.

### Pricing

| Product | Price | Type | Why |
|---|---|---|---|
| **Pro Monthly** | $14.99 / month, **7 days free** | Auto-renewing subscription with an introductory offer | Covers a heavy user after Apple's 15% (~$12.75 net) |
| **Season Pass** | $99.99 once | Non-renewing, 12 months | "Junior spring through Decision Day." Under 7 months of Monthly for a year; most families should choose it |

Both unlock the same thing; the app never cares which was bought.

**What it costs us** (production, 2026-10-09; small sample, real per-call
costs): a counselor message ~6¢, an interview question with voice ~2–3¢, a
"How it fits you" ~1.5¢, a transcript read ~34¢ once. A heavy Pro student
(~50 messages and 3 practice sessions a week) is ~$16/month; typical is
$2–5. **A free account costs at most its one-time sample (~25¢)** — nothing
personal is generated for it, including "How it fits you" on each school page,
already the third-largest AI cost in production.

**Fair use on Pro:** a daily ceiling on counselor messages (e.g. 150/day),
alongside the existing hourly limits, so one runaway account can't cost
hundreds of dollars.

### Free access, in detail

Held until verification is worked out, but it can start now with judgment
instead of proof:

- **Now:** "Can't afford Pro? Request free access" on the paywall and in
  Settings. A short form (a sentence of context, optionally their school). It
  lands in the admin portal; approving grants **12 months of Pro** with source
  *free access*.
- **Later:** a code from the student's school counselor, or self-attested
  fee-waiver eligibility (the Common App's basis). Decide once there's volume.

---

## 2. Families: one purchase, shared

Pro belongs to the **family**, not the account that paid.

- A student or a parent can buy.
- Whoever buys, the linked accounts (via the existing `parent_student_link`)
  share Pro. Parent buys first → prompted to invite their student, who arrives
  with Pro on. Student buys first → the parent they invite is covered.
- Apple ties a purchase to the buyer's Apple ID; **our server** records the
  entitlement and shares it across the link. That's also what makes admin
  control and school seats possible.
- One purchase covers **one student** and their parents. A parent with two
  students buys twice (or we add a family tier later).

> **Code note.** The schema already allows many parents per student and many
> students per parent, but the code assumes one (`linkedStudentIdFor`,
> `shareEssay` use `.limit(1)`). Entitlements should resolve per **student**,
> so a parent's Pro is "the Pro of the student I'm viewing".

---

## 3. Schools and counselors: seats

A school or nonprofit buys **seats** — Pro for a set of its students — and is
invoiced directly. Apple allows this: guideline 3.1.3(c), *Enterprise
Services*, lets an app sold directly to organizations for their students give
those students access, with no in-app purchase and no Apple fee.

### Getting schools in the door

- **"For schools" page** on the marketing site (`lumni-site`): what Lumni does
  for a counseling office, a pilot offer, a short form — school, role, email,
  approximate number of students, message.
- **Same form in the app**, under Settings: "Bring Lumni to your school."
  Students are a channel: "Ask your counselor about Lumni" — and on the
  paywall, a free student whose school has no license can send it to their
  counselor.
- Every form submission lands in the admin portal as a **school lead**, and
  emails us.

### Selling and running seats

- **Price:** a per-seat annual license, well under consumer price — a
  starting point of **$25–$40 per student per year**, with a free pilot (e.g.
  25 seats for a semester) to get in. Set the real number after the first few
  conversations.
- **Billing:** invoiced (Stripe Invoicing, or a plain invoice to start). No
  Apple involvement.
- **Redeeming:** the school gets a **seat code** (e.g. `LINCOLN-HS-7Q2K`).
  A student enters it in the app (Settings → "I have a school code", also on
  the paywall) and gets Pro with source *school license* until the license
  ends. Each redemption uses a seat; the admin portal shows seats used /
  total.
- **Later, if schools want it:** a counselor view of their students' progress
  (opt-in, with student consent). Not in the first version.

---

## 4. Admin portal: account status

### Per user (Users page)

- **Status:** Free · Trial (days left) · Pro
- **Source of Pro:** App Store (Monthly, in trial or paid / Season Pass) ·
  admin grant · free access · school license (which school) · family (via
  linked account)
- **Ends:** a date, or never

Actions, each with a short reason:

- **Grant Pro** — until a date, or indefinitely ("beta tester", "school pilot")
- **Revoke Pro**
- **History** — every change: what, who, when, why

> **Limit.** Revoking in Lumni removes Pro in Lumni, but **cannot cancel or
> refund an App Store subscription or trial** — only Apple or the user can.
> The row says "paid through Apple" and links to App Store Connect.

### New pages

- **Free access requests** — pending / approved / declined; approve grants 12
  months of Pro.
- **Schools** — leads (from the forms), organizations, licenses (seats,
  dates, price, invoice status), seat codes and redemptions.

---

## 5. How it's built

### Data (new tables)

- **`entitlement`** — the single source of truth. Per student: `source`
  (`app_store` | `admin` | `free_access` | `school`), `starts_at`, `ends_at`
  (null = indefinite), `revoked_at`, `in_trial`, `org_id` (school),
  App Store ids (original transaction id, product id). A student is Pro if any
  active row covers *now*. Parents inherit through the link.
- **`account_event`** — append-only history: actor (user, admin or Apple),
  action, reason, before/after. Also the admin portal's first real audit log
  (there's none today).
- **`free_access_request`** — student, message, status, decided by/at.
- **`organization`**, **`school_license`** (seats, dates, price, invoice
  status), **`seat_code`**, **`seat_redemption`**.
- **`school_lead`** — the outreach form.

### Server

- **`lib/entitlements.ts`** — `proStatus(userId)` → `{ tier, source,
  endsAt, inTrial, sampleLeft }`, resolving parents through the link. One
  place every check goes through.
- **Gating** — two layers, because the personal facts aren't AI calls:
  - *AI features* refuse Free in `guardedServiceFor`
    (`lib/actions/counselor.ts`), where every AI call already passes, with a
    `UserFacingError` the app turns into the paywall. The one-time sample is
    counted from `ai_usage`, as `checkRateLimit` already counts — no new
    counters.
  - *Personal results* are withheld in the API responses that carry them:
    for a Free client, `/api/v1/explore` and `/api/v1/schools/:id` return the
    published figures but `null` for chance tier, fit, "net for you",
    residency and the estimate, and skip picks; `/api/v1/snapshot` omits the
    counselor's cards and "This week". A Free client never receives Pro
    content, so a modified app can't unlock it.
  - *The 5-school list* is enforced where list entries are created.
- **App Store** — the app sends the signed StoreKit 2 transaction to
  `POST /api/v1/billing/apple`; the server verifies Apple's signature and
  writes the entitlement. **App Store Server Notifications v2** at
  `/api/apple/notifications` handle trial conversion, renewals,
  cancellations, refunds and expiry. Season Pass: the server sets `ends_at` =
  purchase + 12 months.
- **`/api/v1/snapshot`** — the viewer gains `pro: { tier, source, endsAt,
  inTrial, sampleLeft }` so the app knows what to show.
- **Email** — new templates: welcome to Pro, free access approved, school
  lead notification. (Apple sends its own trial-renewal reminder.)

### iOS

- **StoreKit 2** paywall: the trial on Monthly, the Season Pass, restore
  purchases, Apple's required subscription terms and links, "I have a school
  code", and "Can't afford it?"
- **Shown at the end of onboarding**, then at moments of intent: tapping a
  locked card ("Your chances at Purdue"), saving a 6th school, the sample
  running out (draft kept), two weeks before the first deadline.
- **Locked preview cards** in place of every Pro surface: chances, real cost,
  fit, picks, the counselor's cards, the tracker's details.
- Settings: manage subscription, "I have a school code", "Request free
  access", "Bring Lumni to your school".

### Website (`lumni-site`, Lovable)

- "For schools" page with the lead form (posts to the Lumni API).
- Pricing section: Free vs Pro, both prices, the 7-day trial, the free-access
  promise.

---

## 6. Order of work

1. **Entitlements + admin controls** — tables, `proStatus`, grant/revoke with
   history in the portal. Useful immediately: you can hand out Pro to testers
   and schools before anything is for sale.
2. **Gating** — the Free tier (public directory, 5-school list, one-time
   sample), API responses that withhold personal results from Free, locked
   preview cards (without purchase yet: "Pro is coming — request access").
   Everyone existing is granted Pro first, so testers lose nothing.
3. **App Store purchases** — products and the 7-day introductory offer in App
   Store Connect, the onboarding paywall, StoreKit 2, server verification,
   notifications, family sharing across the link.
4. **Free access requests** — form, admin queue, approval.
5. **Schools** — lead form (site + app), organizations, licenses, seat codes.

Steps 1–2 work without Apple; step 3 needs the setup below first.

---

## 7. Needed from you (outside the code)

- **App Store Connect:** accept the **Paid Applications agreement** and fill
  in **banking and tax** — required before any paid product works, even in
  TestFlight. Account holder only.
- **Small Business Program:** enroll Prompt LLC (15% instead of 30%).
- **School seat price** for the first pilots.
- **Terms and Privacy:** add subscriptions, auto-renewal, trials, refunds
  (via Apple), and school licenses — and bump their versions.

## 8. Decisions made

- **Model (2026-10-09, starting point, may change):** a card-required 7-day
  trial (Apple's introductory offer) offered at the end of onboarding. Free is
  the public directory plus a 5-school list and deadline dates. Everything
  personal — chances, real cost, fit, the counselor, interviews, the tracker —
  is Pro. Replaces the earlier reverse trial and 10-messages-a-week allowance.
- Free sample of the counselor: 2 messages, once; no free interview
  practice (tightened 2026-10-09 after testing — "the right balance").
- Free's directory is the 40 hand-written schools plus the student's own
  list; Explore says so and what Pro opens.
- Monthly ($14.99, 7 days free) **and** Season Pass ($99.99, 12 months).
- Free Pro for students who can't afford it — *yes, admin-approved until
  verification exists*, visible on the paywall.
- Either a parent or a student can buy; the linked family shares Pro.
- Admin can grant, revoke and see the history of any account's Pro.
- Schools and counselors can buy seats, invoiced directly.
