/* ————————————————————————————————————————
   404 inside the signed-in shell.

   This one inherits AppNav and <main> from the (app) layout, so it carries
   only the content — the student keeps their navigation and can get back to
   whatever they were doing in one click.
   ———————————————————————————————————————— */

import Link from "next/link";
import TwoTone from "@/components/ui/TwoTone";
import SectionLabel from "@/components/ui/SectionLabel";

export default function AppNotFound() {
  return (
    <div className="py-8">
      <SectionLabel className="mb-3">Not found</SectionLabel>
      <TwoTone as="h1" size="lg" className="max-w-2xl">
        <em>We couldn&apos;t find that one.</em> Everything else is where you left it.
      </TwoTone>
      <p className="body-copy mt-6 max-w-xl">
        If you followed a link to a school, it may have been renamed. The
        explorer will have it under its current name.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem]">
        <Link href="/explore" className="text-ink underline underline-offset-4">
          Back to the explorer
        </Link>
        <Link href="/dashboard" className="text-ink underline underline-offset-4">
          Your dashboard
        </Link>
      </div>
    </div>
  );
}
