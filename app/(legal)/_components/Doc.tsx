/* Shared typography for the legal documents.

   Kept here rather than as Tailwind prose so the two documents can't drift
   from each other, and so section numbering stays consistent. */

export function DocTitle({
  title,
  effective,
  version,
  summary,
}: {
  title: string;
  effective: string;
  version: string;
  summary: string;
}) {
  return (
    <header className="mb-12">
      <h1 className="text-[2rem] md:text-[2.4rem] font-semibold tracking-tight leading-[1.1] mb-4">
        {title}
      </h1>
      <p className="text-[0.85rem] text-gray-mid mb-6">
        Effective {effective} · Version {version}
      </p>
      <p className="text-[1.05rem] text-gray-strong leading-relaxed border-l-2 border-ink pl-4">
        {summary}
      </p>
    </header>
  );
}

export function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="text-[1.15rem] font-semibold tracking-tight mb-3">
        <span className="text-gray-mid font-normal tabular-nums mr-2">{n}.</span>
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[0.98rem] leading-relaxed text-gray-strong">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-5 list-disc marker:text-gray-mid">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** For clauses that carry real legal weight and should not be skimmed past. */
export function Emphasis({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-hairline rounded-lg bg-surface px-4 py-3 text-[0.95rem]">
      {children}
    </p>
  );
}
