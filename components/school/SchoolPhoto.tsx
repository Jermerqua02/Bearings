"use client";

import { useState } from "react";

/* The banner treatment on a school card and school detail page.

   Was a flat initials block waiting for real imagery. It now shows the
   school's actual logo, served from our own domain by
   /api/school-logo/[id] — stored bytes rather than a link to a favicon
   service, so nothing breaks when that service changes and nobody outside
   Northstar learns which schools a student is browsing.

   The initials remain the fallback, not an error state: roughly one school
   in twenty has no usable logo upstream, and a page with a considered
   monogram reads better than one with a broken-image icon. */

export default function SchoolPhoto({
  schoolId,
  name,
  className = "",
}: {
  schoolId?: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  const showLogo = Boolean(schoolId) && !failed;

  return (
    <div
      aria-hidden
      className={`bg-fill flex items-center justify-center aspect-[4/3] ${className}`}
    >
      {showLogo ? (
        // Plain <img>: small, already cached hard by the route, and served
        // from our own origin — next/image would add optimisation we don't
        // need and remotePatterns config we shouldn't need.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/school-logo/${encodeURIComponent(schoolId!)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          // Absolute caps, not percentages. About a third of these are 32px
          // icons upstream; a percentage of the banner would upscale them
          // into mush, while a max only clamps — so a small logo renders at
          // its native size and a large one is cleanly downscaled.
          className="max-h-[88px] max-w-[88px] w-auto h-auto object-contain"
        />
      ) : (
        <span className="text-[2.5rem] font-semibold text-gray-mid/50 tracking-tight select-none">
          {initials}
        </span>
      )}
    </div>
  );
}
