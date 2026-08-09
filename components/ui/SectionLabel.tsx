import type { ComponentProps } from "react";

/* Small uppercase gray label used above sections and data. */
export default function SectionLabel({
  className = "",
  children,
  ...rest
}: ComponentProps<"p">) {
  return (
    <p {...rest} className={`label-caps ${className}`}>
      {children}
    </p>
  );
}
