/* ————————————————————————————————————————
   Does the model actually read a transcript?

     npm run test:transcript

   This exercises the one part of the feature that cannot be checked by
   reading the code: whether a PDF, base64'd into a `document` block and
   sent with a JSON schema attached, comes back as courses. Every other
   layer — the upload route, the review panel, the insert — is ordinary
   plumbing that fails loudly. This one fails by returning a plausible
   answer, so it needs a document with a known correct reading.

   Needs ANTHROPIC_API_KEY. Costs a fraction of a cent and no database.
   ———————————————————————————————————————— */

import "./_env";

import { createClaudeCounselor } from "@/lib/counselor/claude";
import type { ExtractedCourse } from "@/lib/types";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * A one-page PDF, assembled by hand.
 *
 * No PDF library is a dependency of this project and adding one to write a
 * test fixture would be a poor trade. The format is simple enough at this
 * size: five objects, a cross-reference table of their byte offsets, and a
 * trailer pointing at the catalog.
 */
function transcriptPdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const content =
    `BT /F1 11 Tf 54 740 Td 16 TL\n` +
    lines.map((l) => `(${escape(l)}) Tj T*`).join("\n") +
    `\nET`;

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const TRANSCRIPT_LINES = [
  "LINCOLN HIGH SCHOOL — OFFICIAL TRANSCRIPT",
  "Student: Maya Ellison        Class of 2027",
  "",
  "GRADE 9  (2023-2024)",
  "  English 9                          A-     1.0",
  "  Algebra I                          B+     1.0",
  "  Biology                            A      1.0",
  "  Spanish I                          B      1.0",
  "  World History                      A-     1.0",
  "  Health and Wellness                A      0.5",
  "  Intro to Computer Science          A      0.5",
  "  Concert Band                       A      1.0",
  "",
  "GRADE 10  (2024-2025)",
  "  English 10 Honors                  A      1.0",
  "  Geometry Honors                    B+     1.0",
  "  AP Biology                         B      1.0",
  "  Spanish II                         A-     1.0",
  "  Studio Art                         A      0.5",
  "  AP European History                B+     1.0",
  "  Chemistry                          A-     1.0",
  "  Concert Band                       A      1.0",
  "  Personal Finance                   A      0.5",
  "",
  "GRADE 11  (2025-2026)",
  "  AP English Language                A-     1.0",
  "  Algebra II Honors                  B+     1.0",
  "  AP Chemistry                       B      1.0",
  "  Spanish III Honors                 A      1.0",
  "  AP US History                      A-     1.0",
  "  Digital Photography                A      0.5",
  "  Jazz Ensemble                      A      1.0",
  "  Statistics                         B+     1.0",
  "",
  "GRADE 12  (2026-2027)  IN PROGRESS",
  "  AP English Literature              --     1.0",
  "  AP Calculus AB                     --     1.0",
  "  AP Physics 1                       --     1.0",
  "  AP Spanish Language                --     1.0",
  "  AP Government                      --     0.5",
  "  Ceramics                           --     0.5",
  "  Jazz Ensemble                      --     1.0",
  "  Senior Seminar                     --     0.5",
];


/** The reading a person would produce from the same page. */
const EXPECTED = [
  { name: /english 9/i, year: 9, level: "regular", grade: "A-" },
  { name: /algebra i\b/i, year: 9, level: "regular", grade: "B+" },
  { name: /biology/i, year: 9, level: "regular", grade: "A" },
  { name: /english 10/i, year: 10, level: "honors", grade: "A" },
  { name: /geometry/i, year: 10, level: "honors", grade: "B+" },
  { name: /ap biology/i, year: 10, level: "ap", grade: "B" },
  { name: /ap english lang/i, year: 11, level: "ap", grade: "A-" },
  { name: /ap calculus/i, year: 12, level: "ap", grade: undefined },
  { name: /spanish iii/i, year: 11, level: "honors", grade: "A" },
  { name: /jazz ensemble/i, year: 11, level: "regular", grade: "A" },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — see .env.example.");
    process.exit(1);
  }

  /*
    TRANSCRIPT_PDF=/path/to/real.pdf reads a real document instead of the
    fixture and prints a summary rather than assertions — the fixture cannot
    cover what real transcripts do (per-term rows, printed cumulative GPA,
    middle-school credit), and those are exactly the things that broke.
    Deliberately prints counts and the GPA block, not the whole record.
  */
  if (process.env.TRANSCRIPT_PDF) {
    const { readFileSync } = await import("node:fs");
    const path = process.env.TRANSCRIPT_PDF;
    const bytes = readFileSync(path);
    const svc = createClaudeCounselor({
      knownSchoolIds: async () => new Set<string>(),
      userId: "test-transcript",
    });
    const r = await svc.readTranscript({
      bytes,
      contentType: path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png",
      filename: path.split("/").pop() ?? "transcript.pdf",
    });
    const { collapseTermRows, gpaFrom } = await import("@/lib/coursework");
    const folded = collapseTermRows(r.courses);
    console.log(`\nReal transcript: ${bytes.length} bytes`);
    console.log(`  rows read    : ${r.courses.length}  →  folded to ${folded.length} courses`);
    const computed = gpaFrom(
      folded.map((c) => ({ ...c, id: "x", status: "completed" as const })),
    );
    console.log(`  our computed GPA (secondary): ${computed.unweighted}`);
    console.log(`  reported GPA : ${JSON.stringify(r.reportedGpa)}`);
    console.log("  sample folded rows:");
    for (const c of folded.slice(0, 6)) {
      console.log(`    ${c.year}  ${c.name} — ${c.grade ?? "-"}  [${c.term ?? "-"}]  ${c.credits ?? "-"} cr`);
    }
    const byYear = [9, 10, 11, 12].map(
      (y) => `${y}:${folded.filter((c) => c.year === y).length}`,
    );
    console.log(`  per year     : ${byYear.join("  ")}`);
    console.log("  notes:");
    for (const n of r.notes) console.log(`    — ${n}`);
    process.exit(0);
  }

  const pdf = transcriptPdf(TRANSCRIPT_LINES);
  console.log(`\nTranscript reading  (${pdf.length} byte fixture PDF)\n`);

  const counselor = createClaudeCounselor({
    knownSchoolIds: async () => new Set<string>(),
    // Metering writes to the database, which this test doesn't have. The
    // recordUsage path swallows its own errors by design, so this is safe.
    userId: "test-transcript",
  });

  const reading = await counselor.readTranscript({
    bytes: pdf,
    contentType: "application/pdf",
    filename: "maya-ellison-transcript.pdf",
  });

  check("recognised the document as a transcript", reading.looksLikeTranscript);
  // The count is the regression test for the truncation bug: a budget too
  // small for the whole array came back as a JSON parse error, and a budget
  // slightly too small would come back as a short, plausible-looking list.
  check(
    "read every course on the page",
    reading.courses.length === 33,
    `got ${reading.courses.length}, the page lists 33`,
  );

  const find = (re: RegExp): ExtractedCourse | undefined =>
    reading.courses.find((c) => re.test(c.name));

  for (const want of EXPECTED) {
    const got = find(want.name);
    if (!got) {
      check(`read "${want.name.source}"`, false, "not found");
      continue;
    }
    check(
      `"${got.name}" — grade ${want.year}, ${want.level}, ${want.grade ?? "no grade"}`,
      got.year === want.year && got.level === want.level && got.grade === want.grade,
      `got grade ${got.year}, ${got.level}, ${got.grade ?? "no grade"}`,
    );
  }

  // The subject enum is a database constraint, not a preference: a value
  // outside it fails the insert with a Postgres error the student sees.
  const SUBJECTS = new Set([
    "English", "Math", "Science", "Social Studies", "Language", "Arts", "Elective",
  ]);
  const badSubject = reading.courses.find((c) => !SUBJECTS.has(c.subject));
  check(
    "every subject is one the column accepts",
    !badSubject,
    badSubject && `${badSubject.name} → "${badSubject.subject}"`,
  );

  const badYear = reading.courses.find((c) => ![9, 10, 11, 12].includes(c.year));
  check("every year is 9–12", !badYear, badYear && `${badYear.name} → ${badYear.year}`);

  // The failure that matters most: a course the document does not contain.
  const invented = reading.courses.filter(
    (c) => !TRANSCRIPT_LINES.some((l) => l.toLowerCase().includes(firstWords(c.name))),
  );
  check(
    "invented no courses",
    invented.length === 0,
    invented.map((c) => `"${c.name}" (grade ${c.year})`).join(", "),
  );

  if (process.env.VERBOSE) {
    console.log("\n  Everything it read:");
    for (const c of reading.courses) {
      console.log(`    ${c.year}  ${c.name} [${c.subject}/${c.level}] ${c.grade ?? "-"}`);
    }
  }

  if (reading.notes.length) {
    console.log("\n  Notes it raised:");
    for (const n of reading.notes) console.log(`    — ${n}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

/** Enough of a course name to match the source line despite tidying. */
function firstWords(name: string): string {
  return name.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
