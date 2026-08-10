"use client";

import { useState } from "react";

/* A school's mark.

   The logo when we have one, a monogram when we don't. Roughly one school
   in twenty has no usable logo upstream, so the fallback is a normal state
   rather than an error — it should look like a choice, not a gap. A grey
   box or a broken-image icon would read as the page failing.

   The monogram derives its tint from the school's name, so a given school
   looks the same everywhere in the product and two adjacent cards rarely
   collide. */

const TINTS = [
  "bg-[#1a1a1a]",
  "bg-[#2d3f5e]",
  "bg-[#3f5e4a]",
  "bg-[#5e3f3f]",
  "bg-[#4a3f5e]",
  "bg-[#5e523f]",
];

/** Stable per name — the same school gets the same tint on every render. */
function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length]!;
}

/** "University of Michigan" → "UM"; "MIT" → "MI"; "Yale" → "Y". */
function initials(name: string): string {
  const skip = new Set(["of", "the", "and", "at", "in", "for", "&"]);
  const words = name
    .replace(/[^A-Za-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !skip.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export default function SchoolMark({
  schoolId,
  name,
  size = 40,
  className = "",
}: {
  schoolId: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const box = `shrink-0 rounded-lg overflow-hidden border border-hairline ${className}`;
  const style = { width: size, height: size };

  if (failed) {
    return (
      <div
        className={`${box} ${tintFor(name)} flex items-center justify-center`}
        style={style}
        aria-hidden="true"
      >
        <span
          className="text-paper font-semibold tracking-tight leading-none"
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {initials(name)}
        </span>
      </div>
    );
  }

  return (
    <div className={`${box} bg-surface flex items-center justify-center`} style={style}>
      {/* Plain <img>: these are small, already cached hard by the route, and
          served from our own origin — next/image would add a second layer of
          optimisation for no gain and would need remotePatterns config. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/school-logo/${encodeURIComponent(schoolId)}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="w-full h-full object-contain p-1"
      />
    </div>
  );
}
