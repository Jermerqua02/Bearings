/* ————————————————————————————————————————
   Import institutions from the U.S. Department of Education's College
   Scorecard, and store a logo for each one.

     npm run import:schools -- --limit 200      # a slice, for trying it out
     npm run import:schools                     # all 4-year institutions
     npm run import:schools -- --logos-only     # refetch logos, skip the data

   Needs COLLEGE_SCORECARD_KEY (free, instant, api.data.gov/signup).
   DEMO_KEY works but is rate-limited to roughly 30 requests an hour, which
   is enough to prove the thing runs and not enough to finish an import.

   Two deliberate choices:

   Curated schools are never overwritten. The 40 hand-written entries carry
   editorial fields Scorecard has no equivalent for — vibe, common
   complaints, what a place is underrated for — and those are the reason the
   product reads like a person wrote it. Imported rows fill in around them.

   Logos are downloaded and stored as bytes. A remote logo URL is a link
   that rots, and a request the student's browser makes to a third party for
   every card, which would tell that third party which schools a teenager is
   browsing.
   ———————————————————————————————————————— */

import "./_env";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  schoolAdmissions,
  schoolCosts,
  schoolLogos,
  schoolOutcomes,
  schools,
} from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";

const API = "https://api.data.gov/ed/collegescorecard/v1/schools";
const PER_PAGE = 100;

/* Scorecard's numeric codes, mapped to our vocabulary. */

const REGION_BY_STATE: Record<string, string> = {
  CT: "northeast", ME: "northeast", MA: "northeast", NH: "northeast", RI: "northeast",
  VT: "northeast", NY: "northeast",
  NJ: "mid-atlantic", PA: "mid-atlantic", DE: "mid-atlantic", MD: "mid-atlantic",
  DC: "mid-atlantic", VA: "mid-atlantic", WV: "mid-atlantic",
  NC: "south", SC: "south", GA: "south", FL: "south", KY: "south", TN: "south",
  AL: "south", MS: "south", AR: "south", LA: "south",
  OH: "midwest", IN: "midwest", IL: "midwest", MI: "midwest", WI: "midwest",
  MN: "midwest", IA: "midwest", MO: "midwest", ND: "midwest", SD: "midwest",
  NE: "midwest", KS: "midwest",
  TX: "southwest", OK: "southwest", NM: "southwest", AZ: "southwest",
  CA: "west", NV: "west", UT: "west", CO: "west", HI: "west",
  WA: "northwest", OR: "northwest", ID: "northwest", MT: "northwest",
  WY: "northwest", AK: "northwest",
};

/** Scorecard `school.locale`: 11–13 city, 21–23 suburb, 31–33 town, 41–43 rural. */
function settingFor(locale: number | null): string {
  if (locale === null) return "suburban";
  if (locale >= 11 && locale <= 13) return "urban";
  if (locale >= 21 && locale <= 23) return "suburban";
  if (locale >= 31 && locale <= 33) return "college-town";
  return "rural";
}

function sizeFor(enrollment: number): string {
  if (enrollment < 5000) return "small";
  if (enrollment <= 15000) return "medium";
  return "large";
}

/**
 * ownership: 1 public, 2 private non-profit, 3 private for-profit.
 * A small private non-profit that mostly awards bachelor's degrees is what
 * people mean by a liberal arts college; Scorecard has no flag for it.
 */
function typeFor(ownership: number, enrollment: number, isHbcu: boolean): string {
  if (isHbcu) return "hbcu";
  if (ownership === 1) return enrollment > 20000 ? "public-flagship" : "public";
  return enrollment < 3000 ? "lac" : "private";
}

/** "https://www.uab.edu/" → "uab.edu" */
function hostname(url: string | null): string | null {
  if (!url) return null;
  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Slug from the institution name, unique-ified by IPEDS id on collision. */
function slugFor(name: string, ipedsId: number): string {
  const base = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base ? `${base}-${ipedsId}` : `school-${ipedsId}`;
}

interface ScorecardRow {
  id: number;
  "school.name": string;
  "school.city": string;
  "school.state": string;
  "school.school_url": string | null;
  "school.locale": number | null;
  "school.ownership": number;
  "school.minority_serving.historically_black": number | null;
  "latest.student.size": number | null;
  "latest.admissions.admission_rate.overall": number | null;
  "latest.admissions.test_requirements": number | null;
  "latest.admissions.sat_scores.25th_percentile.critical_reading": number | null;
  "latest.admissions.sat_scores.75th_percentile.critical_reading": number | null;
  "latest.admissions.sat_scores.25th_percentile.math": number | null;
  "latest.admissions.sat_scores.75th_percentile.math": number | null;
  "latest.admissions.act_scores.25th_percentile.cumulative": number | null;
  "latest.admissions.act_scores.75th_percentile.cumulative": number | null;
  "latest.cost.attendance.academic_year": number | null;
  "latest.cost.avg_net_price.public": number | null;
  "latest.cost.avg_net_price.private": number | null;
  "latest.cost.net_price.public.by_income_level.0-30000": number | null;
  "latest.cost.net_price.public.by_income_level.30001-48000": number | null;
  "latest.cost.net_price.public.by_income_level.48001-75000": number | null;
  "latest.cost.net_price.public.by_income_level.75001-110000": number | null;
  "latest.cost.net_price.public.by_income_level.110001-plus": number | null;
  "latest.cost.net_price.private.by_income_level.0-30000": number | null;
  "latest.cost.net_price.private.by_income_level.30001-48000": number | null;
  "latest.cost.net_price.private.by_income_level.48001-75000": number | null;
  "latest.cost.net_price.private.by_income_level.75001-110000": number | null;
  "latest.cost.net_price.private.by_income_level.110001-plus": number | null;
  "latest.completion.completion_rate_4yr_150nt": number | null;
  "latest.earnings.10_yrs_after_entry.median": number | null;
}

const FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.school_url",
  "school.locale",
  "school.ownership",
  "school.minority_serving.historically_black",
  "latest.student.size",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.test_requirements",
  "latest.admissions.sat_scores.25th_percentile.critical_reading",
  "latest.admissions.sat_scores.75th_percentile.critical_reading",
  "latest.admissions.sat_scores.25th_percentile.math",
  "latest.admissions.sat_scores.75th_percentile.math",
  "latest.admissions.act_scores.25th_percentile.cumulative",
  "latest.admissions.act_scores.75th_percentile.cumulative",
  "latest.cost.attendance.academic_year",
  "latest.cost.avg_net_price.public",
  "latest.cost.avg_net_price.private",
  "latest.cost.net_price.public.by_income_level.0-30000",
  "latest.cost.net_price.public.by_income_level.30001-48000",
  "latest.cost.net_price.public.by_income_level.48001-75000",
  "latest.cost.net_price.public.by_income_level.75001-110000",
  "latest.cost.net_price.public.by_income_level.110001-plus",
  "latest.cost.net_price.private.by_income_level.0-30000",
  "latest.cost.net_price.private.by_income_level.30001-48000",
  "latest.cost.net_price.private.by_income_level.48001-75000",
  "latest.cost.net_price.private.by_income_level.75001-110000",
  "latest.cost.net_price.private.by_income_level.110001-plus",
  "latest.completion.completion_rate_4yr_150nt",
  "latest.earnings.10_yrs_after_entry.median",
].join(",");

/* ————— Scorecard values → our vocabulary ————— */

/**
 * SAT mid-50%, summed across the two sections.
 *
 * Scorecard reports reading and math separately; students and schools both
 * talk about the combined 400–1600 number, and that is what `School.satMid50`
 * and every UI that reads it expect. Both sections must be present — adding a
 * reported reading score to a missing math score would produce a number
 * roughly half of what it claims to be.
 */
function satRange(r: ScorecardRow): [number, number] | null {
  const rLow = r["latest.admissions.sat_scores.25th_percentile.critical_reading"];
  const rHigh = r["latest.admissions.sat_scores.75th_percentile.critical_reading"];
  const mLow = r["latest.admissions.sat_scores.25th_percentile.math"];
  const mHigh = r["latest.admissions.sat_scores.75th_percentile.math"];
  if (rLow == null || rHigh == null || mLow == null || mHigh == null) return null;
  return [rLow + mLow, rHigh + mHigh];
}

/**
 * `latest.admissions.test_requirements`: 1 required, 2 recommended,
 * 3 neither required nor recommended, 4 unknown, 5 considered but not
 * required.
 *
 * Only code 1 maps to "required". Scorecard has no way to say test-*blind*,
 * so we never claim it — "optional" is the honest floor, and the explorer's
 * testing filter only ever excludes "required", so nothing downstream
 * over-promises.
 */
function testPolicyFor(code: number | null): "required" | "optional" {
  return code === 1 ? "required" : "optional";
}

/** Public and private institutions report net price in different fields. */
function netPrice(r: ScorecardRow, ownership: number) {
  const pub = ownership === 1;
  const band = (b: string) =>
    pub
      ? r[`latest.cost.net_price.public.by_income_level.${b}` as keyof ScorecardRow]
      : r[`latest.cost.net_price.private.by_income_level.${b}` as keyof ScorecardRow];

  const lowest = band("0-30000") as number | null;
  const low = band("30001-48000") as number | null;

  // Our schema has four income bands and Scorecard has five: the bottom two
  // both fall under our "under 48k". Averaged when both are present so the
  // figure reflects the whole band rather than one end of it.
  const under48k =
    lowest != null && low != null
      ? Math.round((lowest + low) / 2)
      : (lowest ?? low ?? null);

  return {
    avg:
      (r["latest.cost.avg_net_price.public"] ?? r["latest.cost.avg_net_price.private"]) ?? null,
    under48k,
    k48to75: band("48001-75000") as number | null,
    k75to110: band("75001-110000") as number | null,
    over110k: band("110001-plus") as number | null,
  };
}

async function fetchPage(key: string, page: number): Promise<{ rows: ScorecardRow[]; total: number }> {
  const url =
    `${API}?api_key=${encodeURIComponent(key)}` +
    `&school.degrees_awarded.predominant=3` + // predominantly bachelor's
    `&school.operating=1` +
    `&fields=${FIELDS}&per_page=${PER_PAGE}&page=${page}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Scorecard returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { results: ScorecardRow[]; metadata: { total: number } };
  return { rows: json.results ?? [], total: json.metadata?.total ?? 0 };
}

/**
 * Largest pixel dimension in an image, read from its header.
 *
 * Byte length is a bad proxy for resolution: a 15 KB .ico is often several
 * small frames rather than one large one, and picking by size gives you a
 * 16×16 icon blown up across a card. PNG and ICO headers are both cheap to
 * parse, and this only runs at import time.
 */
function pixelSize(bytes: Buffer): number {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian u32.
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return Math.max(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  }
  // ICO: header 0x00 0x00 0x01 0x00, count at offset 4, then 16-byte entries
  // whose first two bytes are width and height. A stored 0 means 256.
  if (bytes.length > 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    const count = bytes.readUInt16LE(4);
    let best = 0;
    for (let i = 0; i < count; i++) {
      const off = 6 + i * 16;
      if (off + 1 >= bytes.length) break;
      const w = bytes[off] === 0 ? 256 : bytes[off]!;
      const h = bytes[off + 1] === 0 ? 256 : bytes[off + 1]!;
      best = Math.max(best, w, h);
    }
    return best;
  }
  // Unknown format (SVG, JPEG). Assume it's usable rather than discarding it.
  return 64;
}

/**
 * Fetch the best logo available for a domain.
 *
 * Both services are tried and the higher-resolution result wins, rather
 * than taking whichever answers first — the difference is a crisp mark
 * versus a 16×16 icon stretched across a card. Runs at import time only;
 * nothing student-facing ever calls out to these.
 */
async function fetchLogo(
  domain: string,
): Promise<{ bytes: Buffer; contentType: string; sourceUrl: string } | null> {
  const sources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];

  let best: { bytes: Buffer; contentType: string; sourceUrl: string; px: number } | null = null;

  for (const sourceUrl of sources) {
    try {
      const res = await fetch(sourceUrl, { redirect: "follow" });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      // Services return a tiny generic placeholder when they have nothing.
      if (bytes.length < 300) continue;
      const px = pixelSize(bytes);
      if (!best || px > best.px) {
        best = {
          bytes,
          contentType: res.headers.get("content-type") ?? "image/x-icon",
          sourceUrl,
          px,
        };
      }
    } catch {
      // Try the next source.
    }
  }

  if (!best) return null;
  const { bytes, contentType, sourceUrl } = best;
  return { bytes, contentType, sourceUrl };
}

/**
 * Domains for the hand-written entries.
 *
 * Scorecard supplies a URL for everything it imports, but the curated
 * schools predate the import and have none — so they'd be the only schools
 * in the product without a logo, which is backwards.
 */
const CURATED_DOMAINS: Record<string, string> = {
  yale: "yale.edu", brown: "brown.edu", cornell: "cornell.edu", duke: "duke.edu",
  stanford: "stanford.edu", northwestern: "northwestern.edu", mit: "mit.edu",
  "georgia-tech": "gatech.edu", "rose-hulman": "rose-hulman.edu", wpi: "wpi.edu",
  purdue: "purdue.edu", umich: "umich.edu", uva: "virginia.edu", unc: "unc.edu",
  "ut-austin": "utexas.edu", wisconsin: "wisc.edu", uw: "washington.edu",
  ucla: "ucla.edu", berkeley: "berkeley.edu", "ohio-state": "osu.edu",
  uga: "uga.edu", pitt: "pitt.edu", williams: "williams.edu",
  carleton: "carleton.edu", grinnell: "grinnell.edu",
  "college-of-wooster": "wooster.edu", davidson: "davidson.edu",
  "st-olaf": "stolaf.edu", denison: "denison.edu", macalester: "macalester.edu",
  occidental: "oxy.edu", howard: "howard.edu", spelman: "spelman.edu",
  morehouse: "morehouse.edu", "nc-at": "ncat.edu", "case-western": "case.edu",
  "miami-ohio": "miamioh.edu", "santa-clara": "scu.edu", butler: "butler.edu",
  "truman-state": "truman.edu",
};

/**
 * The admissions, cost, and outcome rows for a page of institutions.
 *
 * These three tables existed and were written by nothing but the seed
 * script, so every imported school had a name and a location and not one
 * number a student could act on — no admit rate, no net price, no test
 * range. That is the whole reason the explorer could be filtered down to
 * nothing: forty schools were carrying every combination of filters.
 *
 * onConflictDoNothing throughout: the curated forty have hand-written
 * figures that are better than Scorecard's — they include GPA ranges and
 * real application deadlines, neither of which Scorecard publishes — and a
 * re-run must never overwrite them.
 *
 * A row is written only if it carries at least one real number. An
 * all-null row is worse than no row: it reads downstream as "we looked and
 * the answer is nothing" rather than "we don't know".
 */
async function writeChildren(rows: ScorecardRow[]) {
  const admissions = [];
  const costs = [];
  const outcomes = [];

  for (const r of rows) {
    const id = slugFor(r["school.name"], r.id);
    const sat = satRange(r);
    const actLow = r["latest.admissions.act_scores.25th_percentile.cumulative"];
    const actHigh = r["latest.admissions.act_scores.75th_percentile.cumulative"];
    const rate = r["latest.admissions.admission_rate.overall"];

    if (rate != null || sat || (actLow != null && actHigh != null)) {
      admissions.push({
        schoolId: id,
        cycle: CURRENT_CYCLE,
        acceptanceRate: rate,
        // Scorecard publishes no GPA distribution. Left null rather than
        // estimated — a made-up range would be plotted against a student's
        // real GPA on the detail page.
        gpaMid50Low: null,
        gpaMid50High: null,
        satMid50Low: sat?.[0] ?? null,
        satMid50High: sat?.[1] ?? null,
        actMid50Low: actLow,
        actMid50High: actHigh,
        testPolicy: testPolicyFor(r["latest.admissions.test_requirements"]) as never,
        // Application plans and their deadlines aren't in Scorecard. The UI
        // falls back to "see school site" on an empty list.
        plansOffered: [],
      });
    }

    const np = netPrice(r, r["school.ownership"]);
    const sticker = r["latest.cost.attendance.academic_year"];
    if (np.avg != null || sticker != null || np.under48k != null) {
      costs.push({
        schoolId: id,
        year: CURRENT_CYCLE,
        stickerPrice: sticker,
        avgNetPrice: np.avg,
        netPriceUnder48k: np.under48k,
        netPrice48to75k: np.k48to75,
        netPrice75to110k: np.k75to110,
        netPriceOver110k: np.over110k,
        // Both are editorial judgements with no Scorecard equivalent.
        percentNeedMet: null,
        meritAid: null,
      });
    }

    const grad = r["latest.completion.completion_rate_4yr_150nt"];
    const earnings = r["latest.earnings.10_yrs_after_entry.median"];
    if (grad != null || earnings != null) {
      outcomes.push({
        schoolId: id,
        year: CURRENT_CYCLE,
        gradRate: grad,
        medianEarnings10yr: earnings,
        alumniNetwork: null,
      });
    }
  }

  if (admissions.length) {
    await db.insert(schoolAdmissions).values(admissions).onConflictDoNothing();
  }
  if (costs.length) {
    await db.insert(schoolCosts).values(costs).onConflictDoNothing();
  }
  if (outcomes.length) {
    await db.insert(schoolOutcomes).values(outcomes).onConflictDoNothing();
  }
}

async function backfillCuratedDomains() {
  let set = 0;
  for (const [id, domain] of Object.entries(CURATED_DOMAINS)) {
    const res = await db
      .update(schools)
      .set({ website: domain, updatedAt: new Date() })
      .where(eq(schools.id, id))
      .returning({ id: schools.id });
    set += res.length;
  }
  console.log(`Curated domains set on ${set} schools.`);
}

async function importLogos(onlyMissing: boolean) {
  const rows = await db
    .select({ id: schools.id, website: schools.website })
    .from(schools)
    .where(onlyMissing ? sql`${schools.website} is not null` : sql`${schools.website} is not null`);

  const existing = onlyMissing
    ? new Set((await db.select({ id: schoolLogos.schoolId }).from(schoolLogos)).map((r) => r.id))
    : new Set<string>();

  const todo = rows.filter((r) => r.website && !existing.has(r.id));
  console.log(`\nLogos: ${todo.length} to fetch (${rows.length} schools have a domain)`);

  let ok = 0;
  let miss = 0;
  for (let i = 0; i < todo.length; i++) {
    const row = todo[i]!;
    const logo = await fetchLogo(row.website!);
    if (!logo) {
      miss++;
    } else {
      await db
        .insert(schoolLogos)
        .values({
          schoolId: row.id,
          bytes: logo.bytes,
          contentType: logo.contentType,
          sourceUrl: logo.sourceUrl,
        })
        .onConflictDoUpdate({
          target: schoolLogos.schoolId,
          set: {
            bytes: logo.bytes,
            contentType: logo.contentType,
            sourceUrl: logo.sourceUrl,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      ok++;
    }
    if ((i + 1) % 50 === 0 || i === todo.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${todo.length} — ${ok} stored, ${miss} without a logo`);
    }
  }
  console.log();
  return { ok, miss };
}

async function main() {
  const args = process.argv.slice(2);
  const logosOnly = args.includes("--logos-only");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

  const key = process.env.COLLEGE_SCORECARD_KEY || "DEMO_KEY";
  if (key === "DEMO_KEY" && !logosOnly) {
    console.log(
      "⚠ Using DEMO_KEY — rate-limited to about 30 requests an hour.\n" +
        "  Get a free key at https://api.data.gov/signup and set COLLEGE_SCORECARD_KEY.\n",
    );
  }

  if (!logosOnly) {
    // Domains have to be on the curated rows before the import runs, because
    // the domain is what identifies them in the Scorecard feed.
    await backfillCuratedDomains();

    /*
      Protecting the curated forty.

      This used to compare Scorecard's generated slug against the curated
      ids — but the generated slug carries the IPEDS number
      ("yale-university-130794") and the curated id does not ("yale"), so
      they never matched and every one of the forty would have been
      inserted a second time, without its editorial copy. Two of each of
      the best-written schools in the product.

      The domain is the identity that survives both naming schemes. When a
      Scorecard row matches a curated one we skip the insert and stamp its
      IPEDS id onto the curated row, so the link is explicit from then on.
      The `curated` flag is what protects it — inferring that from a null
      IPEDS id stopped working the moment we started stamping one.
    */
    const curatedRows = await db
      .select({ id: schools.id, website: schools.website })
      .from(schools)
      .where(eq(schools.curated, true));
    const curatedByDomain = new Map(
      curatedRows.filter((r) => r.website).map((r) => [r.website!.toLowerCase(), r.id]),
    );
    console.log(
      `Protecting ${curatedRows.length} curated schools (matched by domain, not slug).`,
    );

    let page = 0;
    let imported = 0;
    let matchedCurated = 0;
    let total = 0;

    while (imported < limit) {
      const { rows, total: t } = await fetchPage(key, page);
      total = t;
      if (rows.length === 0) break;

      const usable = rows.filter((r) => r["school.name"] && r["school.state"]);

      // Curated schools: link, don't duplicate.
      const curatedHits: { id: string; ipedsId: number }[] = [];
      const fresh: ScorecardRow[] = [];
      for (const r of usable) {
        const domain = hostname(r["school.school_url"]);
        const curatedId = domain ? curatedByDomain.get(domain) : undefined;
        if (curatedId) curatedHits.push({ id: curatedId, ipedsId: r.id });
        else fresh.push(r);
      }
      for (const hit of curatedHits) {
        await db
          .update(schools)
          .set({ ipedsId: hit.ipedsId, updatedAt: new Date() })
          .where(eq(schools.id, hit.id));
      }
      matchedCurated += curatedHits.length;

      const values = fresh.map((r) => {
        const enrollment = r["latest.student.size"] ?? 0;
        const ownership = r["school.ownership"];
        const isHbcu = r["school.minority_serving.historically_black"] === 1;
        return {
          id: slugFor(r["school.name"], r.id),
          ipedsId: r.id,
          name: r["school.name"],
          shortName: r["school.name"].replace(/^The /, "").slice(0, 40),
          city: r["school.city"] ?? "",
          state: r["school.state"],
          region: (REGION_BY_STATE[r["school.state"]] ?? "west") as never,
          type: typeFor(ownership, enrollment, isHbcu) as never,
          setting: settingFor(r["school.locale"]) as never,
          size: sizeFor(enrollment) as never,
          undergradEnrollment: enrollment,
          website: hostname(r["school.school_url"]),
        };
      });

      if (values.length > 0) {
        await db
          .insert(schools)
          .values(values)
          .onConflictDoUpdate({
            target: schools.id,
            set: {
              name: sql`excluded.name`,
              city: sql`excluded.city`,
              state: sql`excluded.state`,
              undergradEnrollment: sql`excluded.undergrad_enrollment`,
              website: sql`excluded.website`,
              ipedsId: sql`excluded.ipeds_id`,
              updatedAt: new Date(),
            },
          });

        await writeChildren(fresh);
      }

      imported += values.length;
      page++;
      process.stdout.write(`\r  imported ${imported} of ${total}…`);
      if (rows.length < PER_PAGE) break;
    }
    console.log(`\n  done — ${imported} institutions imported.`);
    if (matchedCurated > 0) {
      console.log(`  ${matchedCurated} matched a curated school and were left alone.`);
    }
  }

  await backfillCuratedDomains();
  const { ok, miss } = await importLogos(true);
  console.log(`\nLogos stored: ${ok}. Without one: ${miss} (those fall back to a monogram).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
