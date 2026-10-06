/* ————————————————————————————————————————
   Positioned text out of a PDF, with no dependency.

   Adding a PDF library to pull two columns out of one file is a poor trade,
   and the file we need is unusually cooperative: PDF 1.4, no object streams,
   no cross-reference streams, 199 plainly addressable objects, and three
   Identity-H fonts that each ship a real ToUnicode CMap.

   Why positions rather than a flat string: the source is a table. Reading it
   as text loses which column a value was in, and a value in the wrong column
   is a deadline attributed to the wrong school. Every run comes back with the
   x/y it was drawn at, so the caller can rebuild rows and columns.

   Identity-H encodes two bytes per glyph, so a byte-at-a-time read sees the
   high byte of every glyph as a stray character. Decoding goes through the
   font's own ToUnicode map — the only thing that is actually authoritative
   about what a glyph means. An earlier spike guessed a fixed +0x1D shift off
   the subset's glyph ordering; it happened to work on the pages that were
   looked at, which is precisely the kind of thing that stops working on the
   page nobody checked.
   ———————————————————————————————————————— */

import { inflateSync } from "node:zlib";

export interface TextRun {
  /** Device-space position the run starts at. Origin is bottom-left. */
  x: number;
  y: number;
  text: string;
}

/** One PDF object: the dictionary bytes, and the stream payload if it has one. */
interface PdfObject {
  dict: Buffer;
  stream: Buffer | null;
}

const OBJ = /(\d+)\s+\d+\s+obj\b/g;

function readObjects(pdf: Buffer): Map<number, PdfObject> {
  const out = new Map<number, PdfObject>();
  const text = pdf.toString("latin1");

  for (const m of text.matchAll(OBJ)) {
    const num = Number(m[1]);
    const start = m.index! + m[0].length;
    const end = text.indexOf("endobj", start);
    if (end === -1) continue;

    const sIdx = text.indexOf("stream", start);
    let dictEnd = end;
    let stream: Buffer | null = null;

    if (sIdx !== -1 && sIdx < end) {
      dictEnd = sIdx;
      // The spec allows CRLF or LF after the `stream` keyword, never CR alone.
      let from = sIdx + "stream".length;
      if (text[from] === "\r") from++;
      if (text[from] === "\n") from++;
      const sEnd = text.indexOf("endstream", from);
      if (sEnd !== -1) stream = pdf.subarray(from, sEnd);
    }

    out.set(num, { dict: pdf.subarray(start, dictEnd), stream });
  }
  return out;
}

/**
 * Inflate when the object says it is deflated.
 *
 * Streams that fail to inflate are skipped rather than thrown on: a PDF can
 * legitimately carry image and font payloads we have no interest in, and one
 * of them failing is not a reason to abandon the text.
 */
function payload(obj: PdfObject): Buffer | null {
  if (!obj.stream) return null;
  if (!obj.dict.includes("/FlateDecode")) return obj.stream;
  try {
    return inflateSync(obj.stream);
  } catch {
    return null;
  }
}

/* ————————————— ToUnicode ————————————— */

function hexToChars(hex: string): string {
  let out = "";
  for (let i = 0; i + 3 < hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
}

/**
 * A glyph-id → text map, read from a font's ToUnicode CMap.
 *
 * Handles both forms the CMap grammar allows: `beginbfchar` pairs mapping one
 * code at a time, and `beginbfrange` triples, whose third element is either a
 * starting value to increment from or an explicit array of destinations.
 */
function readCMap(src: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(p[1], 16), hexToChars(p[2]));
    }
  }

  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];

    for (const r of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const lo = parseInt(r[1], 16);
      const hi = parseInt(r[2], 16);
      const base = parseInt(r[3], 16);
      // A runaway range would allocate unboundedly; real ones are small.
      if (hi - lo > 0xffff) continue;
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(base + (c - lo)));
    }

    for (const r of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(r[1], 16);
      const dsts = [...r[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((d) => hexToChars(d[1]));
      dsts.forEach((d, i) => map.set(lo + i, d));
    }
  }

  return map;
}

/* ————————————— Content streams ————————————— */

/**
 * Split a content stream into tokens.
 *
 * Strings are kept whole — a `(` inside a string is data, not a delimiter, and
 * the escape rules mean a naive split gets this wrong on any school with a
 * parenthesis in its name.
 */
function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === "(") {
      let depth = 1;
      let j = i + 1;
      let str = "";
      while (j < src.length && depth > 0) {
        const ch = src[j];
        if (ch === "\\") {
          str += src[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") {
          depth--;
          if (depth === 0) break;
        }
        str += ch;
        j++;
      }
      out.push("(" + str);
      i = j + 1;
      continue;
    }

    if (c === "<" && src[i + 1] !== "<") {
      const j = src.indexOf(">", i);
      if (j === -1) break;
      out.push("<" + src.slice(i + 1, j));
      i = j + 1;
      continue;
    }

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "[" || c === "]") {
      out.push(c);
      i++;
      continue;
    }

    let j = i;
    while (j < src.length && !/[\s()<>[\]]/.test(src[j])) j++;
    if (j === i) j++;
    out.push(src.slice(i, j));
    i = j;
  }

  return out;
}

/** A PDF string token as raw bytes — glyph ids are two bytes each. */
function tokenBytes(tok: string): number[] {
  const body = tok.slice(1);
  if (tok[0] === "<") {
    const hex = body.replace(/[^0-9A-Fa-f]/g, "");
    const out: number[] = [];
    for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return out;
  }
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) out.push(body.charCodeAt(i) & 0xff);
  return out;
}

function decodeGlyphs(bytes: number[], cmap: Map<number, string>): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const gid = (bytes[i] << 8) | bytes[i + 1];
    out += cmap.get(gid) ?? "";
  }
  return out;
}

/**
 * Walk one page's content stream and emit a run per text-showing operator.
 *
 * `TJ` arrays are emitted as a single run: the numbers between the strings are
 * kerning adjustments *within* one piece of text, and treating them as
 * separators is what turns "Adams State University" into three fragments — or,
 * if the space itself is expressed as a kern, into "AdamsStateUniversity".
 */
function runsFor(content: string, fonts: Map<string, Map<number, string>>): TextRun[] {
  const runs: TextRun[] = [];
  const toks = tokenize(content);

  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let cmap: Map<number, string> = new Map();

  const num = (k: number) => Number(toks[k]) || 0;

  const setLine = (tx: number, ty: number) => {
    tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + tx * tlm[0], tlm[5] + ty * tlm[3]];
    tm = [...tlm];
  };

  const emit = (text: string) => {
    if (text.trim()) runs.push({ x: tm[4], y: tm[5], text });
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];

    switch (t) {
      case "Tf": {
        const name = toks[i - 2];
        cmap = fonts.get(name?.replace(/^\//, "") ?? "") ?? new Map();
        break;
      }
      case "Tm":
        tlm = [num(i - 6), num(i - 5), num(i - 4), num(i - 3), num(i - 2), num(i - 1)];
        tm = [...tlm];
        break;
      case "Td":
        setLine(num(i - 2), num(i - 1));
        break;
      case "TD":
        leading = -num(i - 1);
        setLine(num(i - 2), num(i - 1));
        break;
      case "TL":
        leading = num(i - 1);
        break;
      case "T*":
        setLine(0, -leading);
        break;
      case "Tj":
      case "'":
      case '"': {
        if (t !== "Tj") setLine(0, -leading);
        const tok = toks[i - 1];
        if (tok && (tok[0] === "(" || tok[0] === "<")) {
          emit(decodeGlyphs(tokenBytes(tok), cmap));
        }
        break;
      }
      case "TJ": {
        // Scan back for the `[` that opens this array. The scan starts one
        // token before the closing `]` — starting *on* it would count it as a
        // nested level and walk past the real opening bracket to an earlier
        // array, silently dropping this run.
        let open = -1;
        let depth = 0;
        for (let k = i - 2; k >= 0; k--) {
          if (toks[k] === "]") depth++;
          else if (toks[k] === "[") {
            if (depth === 0) {
              open = k;
              break;
            }
            depth--;
          }
        }
        if (open === -1) break;
        let text = "";
        for (let k = open + 1; k < i - 1; k++) {
          const tok = toks[k];
          if (tok && (tok[0] === "(" || tok[0] === "<")) {
            text += decodeGlyphs(tokenBytes(tok), cmap);
          }
        }
        emit(text);
        break;
      }
    }
  }

  return runs;
}

/* ————————————— Entry point ————————————— */

/**
 * Every page's text runs, in page order.
 *
 * Pages come back in the order their objects appear in the file, which for a
 * generated document is page order. The caller should not depend on that for
 * correctness — the grid is keyed by school name, not by page.
 */
export function extractPages(pdf: Buffer): TextRun[][] {
  const objects = readObjects(pdf);

  const cmaps = new Map<number, Map<number, string>>();
  const cmapFor = (ref: number): Map<number, string> => {
    const hit = cmaps.get(ref);
    if (hit) return hit;
    const body = payload(objects.get(ref) ?? { dict: Buffer.alloc(0), stream: null });
    const map = body ? readCMap(body.toString("latin1")) : new Map<number, string>();
    cmaps.set(ref, map);
    return map;
  };

  /** /Font0 → the glyph map of whatever font object it points at. */
  const fontsFor = (resourceDict: string): Map<string, Map<number, string>> => {
    const out = new Map<string, Map<number, string>>();
    const block = /\/Font\s*<<([\s\S]*?)>>/.exec(resourceDict);
    if (!block) return out;
    for (const f of block[1].matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
      const fontObj = objects.get(Number(f[2]));
      if (!fontObj) continue;
      const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fontObj.dict.toString("latin1"));
      if (tu) out.set(f[1], cmapFor(Number(tu[1])));
    }
    return out;
  };

  const pages: TextRun[][] = [];

  for (const [, obj] of objects) {
    const dict = obj.dict.toString("latin1");
    if (!/\/Type\s*\/Page\b/.test(dict)) continue;

    const contents = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(dict);
    const resRef = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(dict);
    if (!contents) continue;

    const body = payload(objects.get(Number(contents[1])) ?? { dict: Buffer.alloc(0), stream: null });
    if (!body) continue;

    const resDict = resRef
      ? (objects.get(Number(resRef[1]))?.dict.toString("latin1") ?? "")
      : dict;

    pages.push(runsFor(body.toString("latin1"), fontsFor(resDict)));
  }

  return pages;
}

/**
 * Group a page's runs into visual rows.
 *
 * Cells on one line are not drawn at byte-identical y — a baseline shifts by a
 * fraction when a cell uses a different font. `tolerance` is how far apart two
 * runs can sit and still count as the same row.
 */
export function toRows(runs: TextRun[], tolerance = 3): TextRun[][] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextRun[][] = [];

  for (const run of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - run.y) <= tolerance) last.push(run);
    else rows.push([run]);
  }

  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}
