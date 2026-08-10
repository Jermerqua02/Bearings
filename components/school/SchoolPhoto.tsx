"use client";

import { useEffect, useRef, useState } from "react";

/* The banner on a school card and school detail page.

   Every logo renders in an identically sized frame. The images themselves
   arrive at wildly different resolutions — roughly a third are 32px icons,
   half are 128px or better — so an earlier version sized them naturally to
   avoid upscaling, and the result was a grid where some marks were tiny and
   others large. Consistency reads better than per-image fidelity here: one
   fixed box, object-contain, and a little upscaling on the small ones.

   The frame picks up the logo's own colour. It is sampled from the decoded
   pixels rather than stored, because the images are served from our own
   origin — so the canvas is never tainted and no extra round trip or column
   is needed. Results are memoised per school for the life of the page, and
   the tint fades in, so a card never flashes from grey to colour.

   Initials remain the fallback: about one school in twenty has no usable
   logo upstream, and a considered monogram reads better than a broken
   image. */

/** Sampled tints, kept across mounts so a card doesn't recompute on scroll. */
const TINT_CACHE = new Map<string, string>();

/**
 * The most saturated colour in the image, not the most common one.
 *
 * Averaging gives mud, and the commonest pixel in a logo is almost always
 * the white or transparent background. Weighting by saturation finds the
 * colour a person would name if you asked them what colour the logo is.
 */
function sampleTint(img: HTMLImageElement): string | null {
  const size = 32; // Downscale first — we want the gist, not the detail.
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let bestScore = 0;
    let best: [number, number, number] | null = null;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3]!;
      if (a < 128) continue; // Transparent padding.

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      // Ignore near-white and near-black: both are usually background.
      if (max < 40 || min > 225) continue;

      const score = saturation * (max / 255);
      if (score > bestScore) {
        bestScore = score;
        best = [r, g, b];
      }
    }

    // Nothing colourful — a black-and-white wordmark. Leave it neutral.
    if (!best || bestScore < 0.12) return null;
    return `${best[0]},${best[1]},${best[2]}`;
  } catch {
    // A tainted canvas would throw; ours is same-origin, but never break a
    // card over decoration.
    return null;
  }
}

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
  const [tint, setTint] = useState<string | null>(
    schoolId ? (TINT_CACHE.get(schoolId) ?? null) : null,
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A cached image can be complete before onLoad would fire.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !schoolId || tint || !img.complete || img.naturalWidth === 0) return;
    const sampled = sampleTint(img);
    if (sampled) {
      TINT_CACHE.set(schoolId, sampled);
      setTint(sampled);
    }
  }, [schoolId, tint]);

  const initials = name
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  const showLogo = Boolean(schoolId) && !failed;

  // A soft wash of the logo's colour — enough to feel like the school's,
  // not so much that the mark stops being legible against it.
  const background = tint
    ? `linear-gradient(140deg, rgba(${tint},0.20) 0%, rgba(${tint},0.07) 55%, rgba(${tint},0.03) 100%)`
    : undefined;

  return (
    <div
      aria-hidden
      className={`flex items-center justify-center aspect-[4/3] transition-colors duration-500 ${
        background ? "" : "bg-fill"
      } ${className}`}
      style={background ? { background } : undefined}
    >
      {showLogo ? (
        // Plain <img>: small, cached hard by the route, and same-origin —
        // next/image would add optimisation we don't need and
        // remotePatterns config we shouldn't need. Same-origin is also what
        // lets the canvas above read the pixels.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={`/api/school-logo/${encodeURIComponent(schoolId!)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            if (!schoolId || TINT_CACHE.has(schoolId)) return;
            const sampled = sampleTint(e.currentTarget);
            if (sampled) {
              TINT_CACHE.set(schoolId, sampled);
              setTint(sampled);
            }
          }}
          // One size for every school. object-contain keeps aspect ratio, so
          // a wide wordmark and a square crest both sit correctly in it.
          className="h-[72px] w-[72px] object-contain"
        />
      ) : (
        <span className="text-[2.5rem] font-semibold text-gray-mid/50 tracking-tight select-none">
          {initials}
        </span>
      )}
    </div>
  );
}
