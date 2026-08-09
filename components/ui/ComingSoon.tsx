import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";

/* Placeholder surface for screens arriving in later passes.
   Calm, honest — consistent with the product's tone. */
export default function ComingSoon({
  label,
  title,
  muted,
  description,
}: {
  label: string;
  title: string;
  muted: string;
  description: string;
}) {
  return (
    <div className="animate-fade-up">
      <SectionLabel className="mb-3">{label}</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-6 max-w-3xl">
        <em>{title}</em> {muted}
      </TwoTone>
      <Card className="p-8 max-w-2xl">
        <p className="body-copy">{description}</p>
        <p className="label-caps mt-6">In progress — next build pass</p>
      </Card>
    </div>
  );
}
