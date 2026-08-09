import type { ComponentProps } from "react";

/* Flat, hairline-bordered card. No shadows, minimal radius. */
export default function Card({
  className = "",
  children,
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={`border border-hairline bg-surface rounded-[3px] ${className}`}
    >
      {children}
    </div>
  );
}
