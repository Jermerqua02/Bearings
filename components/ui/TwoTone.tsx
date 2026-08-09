import type { ReactNode } from "react";

/**
 * Two-tone headline: key words in near-black, the rest in mid-gray.
 * Usage:
 *   <TwoTone as="h1" size="xl">
 *     <em>Your profile</em> deserves a list that&apos;s{" "}
 *     <em>as realistic as it is exciting.</em>
 *   </TwoTone>
 * <em> children render in ink; everything else renders muted.
 */
export default function TwoTone({
  as: Tag = "h2",
  size = "lg",
  className = "",
  children,
}: {
  as?: "h1" | "h2" | "h3";
  size?: "xl" | "lg" | "md";
  className?: string;
  children: ReactNode;
}) {
  const sizeCls =
    size === "xl" ? "headline-xl" : size === "lg" ? "headline-lg" : "headline-md";
  return (
    <Tag
      className={`${sizeCls} text-gray-mid [&_em]:not-italic [&_em]:text-ink ${className}`}
    >
      {children}
    </Tag>
  );
}
