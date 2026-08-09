import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium uppercase tracking-[0.08em] transition-quiet cursor-pointer select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-black border border-ink",
  outline:
    "border border-ink text-ink bg-transparent hover:bg-ink hover:text-white",
  ghost:
    "border border-hairline text-gray-strong bg-transparent hover:border-ink hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "text-[0.72rem] px-5 h-11", /* ≥44px tap target */
  lg: "text-[0.78rem] px-7 h-12",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & (
  | ({ href: string } & Omit<ComponentProps<typeof Link>, "href">)
  | ({ href?: undefined } & ComponentProps<"button">)
);

export default function Button({
  variant = "outline",
  size = "md",
  children,
  ...rest
}: ButtonProps) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${
    "className" in rest && rest.className ? rest.className : ""
  }`;

  if ("href" in rest && rest.href !== undefined) {
    const { className: _c, ...linkProps } = rest as { href: string } & Omit<
      ComponentProps<typeof Link>,
      "href"
    > & { className?: string };
    return (
      <Link {...linkProps} className={cls}>
        {children}
      </Link>
    );
  }

  const { className: _c, ...buttonProps } = rest as ComponentProps<"button"> & {
    className?: string;
  };
  return (
    <button {...buttonProps} className={cls}>
      {children}
    </button>
  );
}
