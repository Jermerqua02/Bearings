/* The Lumni wordmark, for page headers. Height sets the size; the width
   follows from the logo's proportions (480×143). */

interface Props {
  /** Rendered height in px. Headers use the default. */
  height?: number;
  /** White, for dark backgrounds. */
  inverse?: boolean;
  className?: string;
}

export default function Wordmark({ height = 22, inverse = false, className = "" }: Props) {
  return (
    // Plain <img>: one small file from our own origin, the same in every
    // header — next/image would optimise it again for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={inverse ? "/brand/lumni-wordmark-white.png" : "/brand/lumni-wordmark.png"}
      alt="Lumni"
      width={Math.round((height * 480) / 143)}
      height={height}
      className={`block ${className}`}
    />
  );
}
