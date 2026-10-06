/* ————————————————————————————————————————
   Application fees for the schools Common App doesn't cover.

     npm run import:ipeds-fees -- --dry
     npm run import:ipeds-fees

   The federal Institutional Characteristics survey collected the
   undergraduate application fee as `APPLFEEU`, for 5,696 institutions. That
   fills 1,352 of the 1,366 schools we had no fee for at all.

   Three things about this data that shape how it is written and shown.

   It stops at 2023. IPEDS carried the field through the 2023 survey and then
   removed it — the 2024 file has 111 columns where 2023 had 138, and the
   provisional 2023 file has it too, so this is a discontinued question and
   not a not-yet-revised one. The figure can never get fresher.

   It is three years stale, and stale in a specific direction. Measured
   against the 578 fees we hold from Common App's 2026-27 grid, it agrees
   exactly 79% of the time and within $10 for 86%. Of the disagreements, the
   common shape is a school that has since dropped its fee to nothing —
   colleges have been eliminating application fees steadily.

   That direction is why every row it writes carries `feeYear`. Overstating a
   fee discourages a student from applying, which is the exact harm the fee
   is worth showing to prevent. A figure labelled 2023 lets them check; an
   unlabelled one asks them to believe it.

   It never overwrites a fresher fee. Common App's 2026-27 figure wins
   wherever we have it; this only fills nulls.
   ———————————————————————————————————————— */

import "./_env";

import { inflateRawSync } from "node:zlib";
import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolApplications, schools } from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";


/**
 * The last year the federal survey asked for an application fee.
 *
 * `_RV` is the revised file, which is the one to prefer once it exists — it
 * carries late corrections the provisional release does not.
 */
const SURVEY_YEAR = "2023";
const SOURCE = `https://nces.ed.gov/ipeds/datacenter/data/IC${SURVEY_YEAR}.zip`;
const FILE = `IC${SURVEY_YEAR}_RV.csv`;

/** Urban and NCES both use negative codes for "not reported"/"not applicable". */
function fee(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  // A four-figure application fee is a coding error, not a price.
  return n <= 500 ? Math.round(n) : null;
}

/** Minimal CSV split — the IC file quotes any field containing a comma. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Pull one file out of a zip, without shelling out.
 *
 * `unzip` is not installed on the deploy container, and depending on a
 * system binary to run an import is a dependency that only shows itself in
 * production. This reads the central directory, which is the reliable route:
 * a local header can defer the compressed size to a trailing descriptor,
 * whereas the central directory always carries it.
 */
function extractFromZip(zip: Buffer, wanted: string): Buffer {
  // End of central directory: signature, then the directory's offset at +16.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 22 - 0xffff; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip file");

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localAt = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("latin1");

    if (name.toLowerCase() === wanted.toLowerCase()) {
      // The local header's own name/extra lengths differ from the central
      // directory's, so the data offset must be computed from the local one.
      const lNameLen = zip.readUInt16LE(localAt + 26);
      const lExtraLen = zip.readUInt16LE(localAt + 28);
      const start = localAt + 30 + lNameLen + lExtraLen;
      const body = zip.subarray(start, start + compressedSize);
      return method === 0 ? Buffer.from(body) : inflateRawSync(body);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in archive`);
}

async function fetchFees(): Promise<Map<number, number>> {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`IPEDS returned ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());

  // The file is latin-1 (institution names carry accented characters) but
  // still starts with a UTF-8 BOM, which decodes to three separate latin-1
  // characters rather than one — stripping only the single-character form
  // leaves "ï»¿UNITID" and the column lookup silently misses.
  const text = extractFromZip(zip, FILE).toString("latin1").replace(/^(﻿|ï»¿)/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitRow(lines[0]).map((h) =>
    h.replace(/^(﻿|ï»¿)/, "").trim().toUpperCase(),
  );
  const idAt = header.indexOf("UNITID");
  const feeAt = header.indexOf("APPLFEEU");
  if (idAt === -1 || feeAt === -1) {
    throw new Error(`IC${SURVEY_YEAR} has no UNITID/APPLFEEU — the survey may have changed`);
  }

  const out = new Map<number, number>();
  for (const line of lines.slice(1)) {
    const cols = splitRow(line);
    const id = Number(cols[idAt]);
    const f = fee(cols[feeAt]);
    if (Number.isFinite(id) && f != null) out.set(id, f);
  }
  return out;
}

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`\nApplication fees — IPEDS ${SURVEY_YEAR}${dry ? "  (dry run)" : ""}\n`);

  const fees = await fetchFees();
  console.log(`  ${fees.size} institutions report a fee\n`);

  const ours = await db
    .select({
      id: schools.id,
      ipedsId: schools.ipedsId,
      fee: schoolApplications.feeUsd,
    })
    .from(schools)
    .leftJoin(
      schoolApplications,
      sql`${schoolApplications.schoolId} = ${schools.id} and ${schoolApplications.cycle} = ${CURRENT_CYCLE}`,
    )
    .where(isNotNull(schools.ipedsId));

  const values = [];
  let kept = 0;
  for (const s of ours) {
    // A fee we already hold is from Common App's current grid and is better.
    if (s.fee != null) {
      kept++;
      continue;
    }
    const f = fees.get(s.ipedsId!);
    if (f == null) continue;
    values.push({
      schoolId: s.id,
      cycle: CURRENT_CYCLE,
      feeUsd: f,
      feeSource: "ipeds" as const,
      feeYear: SURVEY_YEAR,
    });
  }

  console.log(`  ${kept} already have a current fee — left alone`);
  console.log(`  ${values.length} would be filled from ${SURVEY_YEAR}`);
  const zero = values.filter((v) => v.feeUsd === 0).length;
  console.log(`    ${zero} free to apply · ${values.length - zero} charge something\n`);

  if (dry) {
    console.log("  dry run — nothing written\n");
    process.exit(0);
  }

  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(schoolApplications)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [schoolApplications.schoolId, schoolApplications.cycle],
        set: {
          feeUsd: sql`excluded.fee_usd`,
          feeSource: sql`excluded.fee_source`,
          feeYear: sql`excluded.fee_year`,
          updatedAt: new Date(),
        },
        // Belt and braces: even if the read above raced, a fee that already
        // exists is never replaced by an older one.
        setWhere: sql`${schoolApplications.feeUsd} is null`,
      });
    process.stdout.write(`\r  wrote ${Math.min(i + 500, values.length)} of ${values.length}…`);
  }

  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where fee_usd is not null)::int`,
      current: sql<number>`count(*) filter (where fee_year = ${CURRENT_CYCLE})::int`,
      older: sql<number>`count(*) filter (where fee_year = ${SURVEY_YEAR})::int`,
    })
    .from(schoolApplications);

  console.log(`\n\n  schools with a fee:  ${row.total}`);
  console.log(`    ${CURRENT_CYCLE} (Common App): ${row.current}`);
  console.log(`    ${SURVEY_YEAR} (federal):      ${row.older}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
