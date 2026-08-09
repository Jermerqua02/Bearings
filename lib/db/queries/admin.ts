/* ————————————————————————————————————————
   Admin queries.

   The rule this file exists to hold: an admin sees counts, status, and
   money. Never content. No query here returns essay text, a counselor
   message, a date of birth, or a test score — and the storage figures
   below are computed with pg_column_size, which reads the rows only to
   measure them and returns a byte count, never the bytes themselves.

   Enforcing it here rather than in the page means a future admin screen
   inherits the boundary instead of having to re-earn it.
   ———————————————————————————————————————— */

import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ACTIVE_WINDOW_DAYS,
  overheadMillicentsPerUser,
  storageMillicentsPerMonth,
} from "@/lib/costs";

export interface UserCostRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  /** AI spend, all time and in the trailing 30 days. */
  aiMillicents: number;
  aiMillicents30d: number;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Bytes this user's rows occupy across every table they own. */
  storageBytes: number;
  /** Storage cost for one month at current size. */
  storageMillicentsPerMonth: number;
  /** This user's share of the flat monthly infrastructure bill. */
  overheadMillicents: number;
  /** AI (30d) + storage/month + overhead share — the all-in monthly run rate. */
  monthlyMillicents: number;
}

/*
  Per-user byte totals.

  One UNION ALL branch per table that stores user-owned rows, resolved to
  the owning user id. Tables reached through a parent (messages via
  thread, versions via essay, turns via session, actions via check-in)
  join up to it.

  This is computed live rather than stored. It is a sequential scan over
  user data, which is correct and cheap at current scale and will want a
  nightly materialized snapshot once these tables are large — the shape
  of the query stays the same either way.
*/
const STORAGE_BY_USER = sql`
  select owner_id, sum(bytes)::bigint as bytes from (
    select user_id    as owner_id, sum(pg_column_size(t.*)) as bytes from "student_profile" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "parent_profile" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "user_preference" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "session" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "account" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "legal_consent" t group by 1
    union all select user_id,    sum(pg_column_size(t.*)) from "ai_usage" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "list_entry" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "essay" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "aid_status" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "recommender" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "universal_profile" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "activity" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "course_plan_entry" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "weekly_check_in" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "interview_session" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "counselor_thread" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "decision_note" t group by 1
    union all select student_id, sum(pg_column_size(t.*)) from "aid_offer" t group by 1
    -- Reached through a parent row.
    union all select th.student_id, sum(pg_column_size(m.*))
      from "counselor_message" m join "counselor_thread" th on th.id = m.thread_id group by 1
    union all select e.student_id, sum(pg_column_size(v.*))
      from "essay_version" v join "essay" e on e.id = v.essay_id group by 1
    union all select s.student_id, sum(pg_column_size(tu.*))
      from "interview_turn" tu join "interview_session" s on s.id = tu.session_id group by 1
    union all select w.student_id, sum(pg_column_size(a.*))
      from "check_in_action" a join "weekly_check_in" w on w.id = a.check_in_id group by 1
  ) parts
  where owner_id is not null
  group by owner_id
`;

/** Every user with what they cost, most expensive first. */
export async function userCosts(): Promise<UserCostRow[]> {
  const rows = await db.execute<{
    user_id: string;
    name: string;
    email: string;
    role: string;
    created_at: Date;
    last_seen_at: Date | null;
    ai_millicents: string | null;
    ai_millicents_30d: string | null;
    ai_calls: string | null;
    input_tokens: string | null;
    output_tokens: string | null;
    storage_bytes: string | null;
  }>(sql`
    with storage as (${STORAGE_BY_USER}),
    ai as (
      select
        user_id,
        sum(cost_millicents)                                                      as ai_millicents,
        sum(cost_millicents) filter (where created_at > now() - interval '30 days') as ai_millicents_30d,
        count(*)                                                                  as ai_calls,
        sum(input_tokens)                                                         as input_tokens,
        sum(output_tokens)                                                        as output_tokens
      from "ai_usage" group by user_id
    ),
    seen as (
      select user_id, max(created_at) as last_seen_at from "session" group by user_id
    )
    select
      u.id as user_id, u.name, u.email, u.role::text as role, u.created_at,
      seen.last_seen_at,
      ai.ai_millicents, ai.ai_millicents_30d, ai.ai_calls, ai.input_tokens, ai.output_tokens,
      storage.bytes as storage_bytes
    from "user" u
    left join ai      on ai.user_id      = u.id
    left join storage on storage.owner_id = u.id
    left join seen    on seen.user_id     = u.id
    order by coalesce(ai.ai_millicents, 0) desc, u.created_at desc
  `);

  // How many people the fixed monthly bill is actually spread across.
  const activeUsers = rows.filter((r) => {
    if (!r.last_seen_at) return false;
    const days = (Date.now() - new Date(r.last_seen_at).getTime()) / 86_400_000;
    return days <= ACTIVE_WINDOW_DAYS;
  }).length;

  const overhead = overheadMillicentsPerUser(activeUsers);
  const n = (v: string | number | null | undefined) => Number(v ?? 0);

  return rows.map((r) => {
    const storageBytes = n(r.storage_bytes);
    const storagePerMonth = storageMillicentsPerMonth(storageBytes);
    const ai30d = n(r.ai_millicents_30d);
    return {
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: new Date(r.created_at),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at) : null,
      aiMillicents: n(r.ai_millicents),
      aiMillicents30d: ai30d,
      aiCalls: n(r.ai_calls),
      inputTokens: n(r.input_tokens),
      outputTokens: n(r.output_tokens),
      storageBytes,
      storageMillicentsPerMonth: storagePerMonth,
      overheadMillicents: overhead,
      monthlyMillicents: ai30d + storagePerMonth + overhead,
    };
  });
}

export interface CostTotals {
  users: number;
  activeUsers: number;
  aiMillicents: number;
  aiMillicents30d: number;
  storageBytes: number;
  storageMillicentsPerMonth: number;
  infraMillicents: number;
  /** All-in monthly run rate: 30d AI + storage + fixed infrastructure. */
  monthlyMillicents: number;
  /** Mean and median monthly cost per active user. */
  meanPerActive: number;
  medianPerActive: number;
}

export function totalsFrom(rows: UserCostRow[]): CostTotals {
  const active = rows.filter((r) => {
    if (!r.lastSeenAt) return false;
    return (Date.now() - r.lastSeenAt.getTime()) / 86_400_000 <= ACTIVE_WINDOW_DAYS;
  });

  const sum = (f: (r: UserCostRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const storageBytes = sum((r) => r.storageBytes);
  const aiMillicents30d = sum((r) => r.aiMillicents30d);
  const storagePerMonth = storageMillicentsPerMonth(storageBytes);
  // The fixed bill is charged once, not once per user — take it directly
  // rather than summing the per-user allocations, which would round up.
  const infraMillicents = overheadMillicentsPerUser(1) * (active.length > 0 ? 1 : 0);

  const monthly = aiMillicents30d + storagePerMonth + infraMillicents;

  const perActive = active.map((r) => r.monthlyMillicents).sort((a, b) => a - b);
  const median =
    perActive.length === 0
      ? 0
      : perActive.length % 2 === 1
        ? perActive[(perActive.length - 1) / 2]!
        : (perActive[perActive.length / 2 - 1]! + perActive[perActive.length / 2]!) / 2;

  return {
    users: rows.length,
    activeUsers: active.length,
    aiMillicents: sum((r) => r.aiMillicents),
    aiMillicents30d,
    storageBytes,
    storageMillicentsPerMonth: storagePerMonth,
    infraMillicents,
    monthlyMillicents: monthly,
    meanPerActive: active.length === 0 ? 0 : monthly / active.length,
    medianPerActive: median,
  };
}

/** AI spend broken out by feature — which parts of the product cost money. */export async function spendByFeature(): Promise<
  Array<{ feature: string; calls: number; millicents: number; millicents30d: number }>
> {
  const rows = await db.execute<{
    feature: string;
    calls: string;
    millicents: string | null;
    millicents_30d: string | null;
  }>(sql`
    select
      feature::text as feature,
      count(*) as calls,
      sum(cost_millicents) as millicents,
      sum(cost_millicents) filter (where created_at > now() - interval '30 days') as millicents_30d
    from "ai_usage"
    group by feature
    order by sum(cost_millicents) desc
  `);
  return rows.map((r) => ({
    feature: r.feature,
    calls: Number(r.calls ?? 0),
    millicents: Number(r.millicents ?? 0),
    millicents30d: Number(r.millicents_30d ?? 0),
  }));
}

export interface AccountRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  /** Which document versions this account has on file. */
  consents: Array<{ document: string; version: string; acceptedAt: Date }>;
}

/**
 * The account roster with consent status.
 *
 * Consent is included here because "who agreed to what, and when" is an
 * administrative fact about the account rather than user content — and
 * because an account with no consent row is a problem you want to be able
 * to see. Signup makes that impossible going forward; accounts created
 * before the consent flow existed will show as missing.
 */
export async function accounts(): Promise<AccountRow[]> {
  const rows = await db.execute<{
    user_id: string;
    name: string;
    email: string;
    role: string;
    email_verified: boolean;
    created_at: Date;
    last_seen_at: Date | null;
    consents: Array<{ document: string; version: string; accepted_at: string }> | null;
  }>(sql`
    select
      u.id as user_id, u.name, u.email, u.role::text as role,
      u.email_verified, u.created_at,
      (select max(created_at) from "session" s where s.user_id = u.id) as last_seen_at,
      (
        select json_agg(json_build_object(
          'document', c.document, 'version', c.version, 'accepted_at', c.accepted_at
        ) order by c.accepted_at)
        from "legal_consent" c where c.user_id = u.id
      ) as consents
    from "user" u
    order by u.created_at desc
  `);

  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role,
    emailVerified: r.email_verified,
    createdAt: new Date(r.created_at),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at) : null,
    consents: (r.consents ?? []).map((c) => ({
      document: c.document,
      version: c.version,
      acceptedAt: new Date(c.accepted_at),
    })),
  }));
}

/* ————————————— Telemetry ————————————— */

export interface DayPoint {
  day: string;
  value: number;
}

export interface Telemetry {
  totalUsers: number;
  students: number;
  parents: number;
  admins: number;
  newInPeriod: number;
  dau: number;
  wau: number;
  mau: number;
  /** Signed up → added a school → started an essay → talked to the counselor. */
  funnel: Array<{ label: string; count: number }>;
  activeByDay: DayPoint[];
  signupsByDay: DayPoint[];
  aiCallsByDay: DayPoint[];
  counselorMessages: number;
  essaysStarted: number;
  schoolsListed: number;
  interviewSessions: number;
}

/**
 * Everything the telemetry page shows, for a window of `days`.
 *
 * Activity is derived from session rows — the only universal record of a
 * user showing up. It undercounts a long single session spanning days,
 * which is the honest direction to be wrong in.
 */
export async function telemetry(days: number): Promise<Telemetry> {
  const [counts] = await db.execute<{
    total: string; students: string; parents: string; admins: string; new_in_period: string;
    dau: string; wau: string; mau: string;
  }>(sql`
    select
      (select count(*) from "user")                                            as total,
      (select count(*) from "user" where role = 'student')                     as students,
      (select count(*) from "user" where role = 'parent')                      as parents,
      (select count(*) from "user" where role = 'admin')                       as admins,
      (select count(*) from "user"
         where created_at > now() - (${days} || ' days')::interval)            as new_in_period,
      (select count(distinct user_id) from "session"
         where created_at > now() - interval '1 day')                          as dau,
      (select count(distinct user_id) from "session"
         where created_at > now() - interval '7 days')                         as wau,
      (select count(distinct user_id) from "session"
         where created_at > now() - interval '30 days')                        as mau
  `);

  const [totals] = await db.execute<{
    messages: string; essays: string; listed: string; interviews: string;
    with_list: string; with_essay: string; with_chat: string;
  }>(sql`
    select
      (select count(*) from "counselor_message")                       as messages,
      (select count(*) from "essay")                                   as essays,
      (select count(*) from "list_entry")                              as listed,
      (select count(*) from "interview_session")                       as interviews,
      (select count(distinct student_id) from "list_entry")            as with_list,
      (select count(distinct student_id) from "essay")                 as with_essay,
      (select count(distinct student_id) from "counselor_thread")      as with_chat
  `);

  // One row per day in the window, zero-filled — a chart with missing days
  // silently rescales its own x-axis and lies about the trend.
  const series = async (table: string, column: string, where = sql``) =>
    db.execute<{ day: string; value: string }>(sql`
      with days as (
        select generate_series(
          date_trunc('day', now() - (${days} || ' days')::interval),
          date_trunc('day', now()),
          interval '1 day'
        )::date as day
      )
      select to_char(d.day, 'MM-DD') as day, coalesce(x.value, 0) as value
      from days d
      left join (
        select date_trunc('day', ${sql.raw(column)})::date as day, ${sql.raw(
          table === "session" ? "count(distinct user_id)" : "count(*)",
        )} as value
        from ${sql.raw(`"${table}"`)}
        where ${sql.raw(column)} > now() - (${days} || ' days')::interval ${where}
        group by 1
      ) x on x.day = d.day
      order by d.day
    `);

  const [activeRows, signupRows, aiRows] = await Promise.all([
    series("session", "created_at"),
    series("user", "created_at"),
    series("ai_usage", "created_at"),
  ]);

  const n = (v: string | number | null | undefined) => Number(v ?? 0);
  const points = (rows: Array<{ day: string; value: string }>): DayPoint[] =>
    rows.map((r) => ({ day: r.day, value: n(r.value) }));

  const students = n(counts?.students);

  return {
    totalUsers: n(counts?.total),
    students,
    parents: n(counts?.parents),
    admins: n(counts?.admins),
    newInPeriod: n(counts?.new_in_period),
    dau: n(counts?.dau),
    wau: n(counts?.wau),
    mau: n(counts?.mau),
    funnel: [
      { label: "Signed up", count: students },
      { label: "Added a school", count: n(totals?.with_list) },
      { label: "Started an essay", count: n(totals?.with_essay) },
      { label: "Used the counselor", count: n(totals?.with_chat) },
    ],
    activeByDay: points(activeRows),
    signupsByDay: points(signupRows),
    aiCallsByDay: points(aiRows),
    counselorMessages: n(totals?.messages),
    essaysStarted: n(totals?.essays),
    schoolsListed: n(totals?.listed),
    interviewSessions: n(totals?.interviews),
  };
}

/** AI spend per day, in millicents, zero-filled across the window. */
export async function spendByDay(days: number): Promise<DayPoint[]> {
  const rows = await db.execute<{ day: string; value: string }>(sql`
    with days as (
      select generate_series(
        date_trunc('day', now() - (${days} || ' days')::interval),
        date_trunc('day', now()),
        interval '1 day'
      )::date as day
    )
    select to_char(d.day, 'MM-DD') as day, coalesce(x.value, 0) as value
    from days d
    left join (
      select date_trunc('day', created_at)::date as day, sum(cost_millicents) as value
      from "ai_usage"
      where created_at > now() - (${days} || ' days')::interval
      group by 1
    ) x on x.day = d.day
    order by d.day
  `);
  return rows.map((r) => ({ day: r.day, value: Number(r.value ?? 0) }));
}

/** AI spend and token totals for a window. */
export async function spendSummary(days: number): Promise<{
  millicents: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const [r] = await db.execute<{
    millicents: string | null; calls: string; input_tokens: string | null; output_tokens: string | null;
  }>(sql`
    select
      sum(cost_millicents) as millicents,
      count(*) as calls,
      sum(input_tokens) as input_tokens,
      sum(output_tokens) as output_tokens
    from "ai_usage"
    where created_at > now() - (${days} || ' days')::interval
  `);
  return {
    millicents: Number(r?.millicents ?? 0),
    calls: Number(r?.calls ?? 0),
    inputTokens: Number(r?.input_tokens ?? 0),
    outputTokens: Number(r?.output_tokens ?? 0),
  };
}

/** Month-to-date AI spend, for the budget gauge. */
export async function spendThisMonth(): Promise<number> {
  const [r] = await db.execute<{ millicents: string | null }>(sql`
    select sum(cost_millicents) as millicents from "ai_usage"
    where created_at >= date_trunc('month', now())
  `);
  return Number(r?.millicents ?? 0);
}
