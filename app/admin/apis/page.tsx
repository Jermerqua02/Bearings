import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { formatUsd, usdFromMillicents } from "@/lib/costs";
import { spendThisMonth } from "@/lib/db/queries/admin";
import { railwayCost } from "@/lib/railway";

export const metadata: Metadata = { title: "APIs · Northstar admin" };
export const dynamic = "force-dynamic";

/* External services this app depends on.

   The registry is declared here rather than derived from process.env: the
   point is to show every service the app *expects*, including the ones not
   configured yet, so a missing key reads as a gap rather than an absence.

   Only variable names appear. No value from process.env is ever rendered —
   this page reports which secrets exist, never what they are. */

interface Service {
  name: string;
  envVars: string[];
  purpose: string;
  console: { label: string; href: string };
  /** Live spend, when we can measure it. */
  spend?: string;
  required: boolean;
}

function statusOf(envVars: string[]): "configured" | "missing" {
  return envVars.every((v) => !!process.env[v]) ? "configured" : "missing";
}

export default async function AdminApisPage() {
  const [railway, monthAi] = await Promise.all([railwayCost(), spendThisMonth()]);

  const services: Service[] = [
    {
      name: "Anthropic (Claude)",
      envVars: ["ANTHROPIC_API_KEY"],
      purpose: "The counselor, essay critique, interview practice, school explanations",
      console: { label: "Anthropic Console", href: "https://console.anthropic.com" },
      spend: `${formatUsd(usdFromMillicents(monthAi))} MTD`,
      required: true,
    },
    {
      name: "Railway",
      envVars: ["RAILWAY_API_TOKEN", "RAILWAY_PROJECT_ID"],
      purpose: "App hosting and Postgres — read-only, for the cost figures",
      console: { label: "Railway dashboard", href: "https://railway.com/dashboard" },
      spend: railway.configured ? `${formatUsd(railway.projectedUsd)} proj.` : undefined,
      required: false,
    },
    {
      name: "Postgres",
      envVars: ["DATABASE_URL"],
      purpose: "Primary database (billed through Railway)",
      console: { label: "Railway dashboard", href: "https://railway.com/dashboard" },
      required: true,
    },
    {
      name: "Better Auth",
      envVars: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
      purpose: "Sessions and password hashing — self-hosted, no third party holds PII",
      console: { label: "Better Auth docs", href: "https://better-auth.com" },
      required: true,
    },
    {
      name: "Email delivery",
      envVars: ["RESEND_API_KEY", "RESEND_FROM"],
      purpose: "Password resets, budget alerts, parent link invitations",
      console: { label: "Resend dashboard", href: "https://resend.com/overview" },
      required: false,
    },
  ];

  return (
    <div>
      <SectionLabel className="mb-4">APIs</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-4">
        <em>External services</em> this app depends on.
      </TwoTone>
      <p className="text-[0.95rem] text-gray-mid mb-8 max-w-2xl leading-relaxed">
        Live spend where a provider exposes it; everything else links out to the
        provider&apos;s console. Only variable names are shown — no secret value
        is ever rendered on this page.
      </p>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.9rem] min-w-[48rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-5 py-3">Service</th>
                <th className="font-normal px-5 py-3">Purpose</th>
                <th className="font-normal px-5 py-3">Status</th>
                <th className="font-normal px-5 py-3 text-right">Spend</th>
                <th className="font-normal px-5 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const status = statusOf(s.envVars);
                return (
                  <tr key={s.name} className="border-b border-hairline last:border-0 align-top">
                    <td className="px-5 py-4">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[0.78rem] text-gray-mid font-mono mt-0.5">
                        {s.envVars.join(", ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-strong max-w-sm">{s.purpose}</td>
                    <td className="px-5 py-4">
                      {status === "configured" ? (
                        <span className="text-gray-mid">Configured</span>
                      ) : (
                        <span className={s.required ? "text-ink font-medium" : "text-gray-mid"}>
                          {s.required ? "Missing" : "Not set up"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {s.spend ?? <span className="text-gray-mid">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <a
                        href={s.console.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink underline underline-offset-4 whitespace-nowrap"
                      >
                        {s.console.label} ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!railway.configured && (
        <p className="mt-6 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
          <strong className="text-gray-strong">Infrastructure cost isn&apos;t live.</strong>{" "}
          {railway.reason} Add both variables to the web service on Railway and
          the Costs page will report the real bill instead of a flat estimate.
        </p>
      )}
    </div>
  );
}
