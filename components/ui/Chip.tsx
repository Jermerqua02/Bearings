"use client";

import type { ComponentProps } from "react";

/* Pill chip — used for suggested prompts, filters, evidence chips. */
export default function Chip({
  active,
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      /* Filter chips are toggles and carried their state in colour alone.
         Undefined when the caller never passes `active` — a suggested
         prompt is a button, not a switch, and shouldn't claim to be one. */
      aria-pressed={active}
      {...rest}
      className={`inline-flex items-center min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-full border text-[0.9rem] transition-quiet cursor-pointer ${
        active
          ? "border-ink bg-ink text-white"
          : "border-hairline bg-surface text-gray-strong hover:border-ink hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}
