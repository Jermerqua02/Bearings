import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import Card from "@/components/ui/Card";
import { db } from "@/lib/db";
import { parentStudentLinks, users } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/policy";
import AcceptInvite from "./AcceptInvite";

export const dynamic = "force-dynamic";

/* Where a parent invitation lands.

   Three states, and they matter in this order:

   1. The token is dead (used, revoked, never existed) — say so plainly
      rather than showing an accept button that will fail.
   2. Nobody is signed in — a parent following this link usually has no
      account yet, so send them to sign-up with the invite carried through
      rather than dropping them on a generic page and losing the link.
   3. Signed in — show who invited them and what they will and won't be
      able to see, then let them accept.

   The token is only ever read here, never displayed. */

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [link] = await db
    .select({
      id: parentStudentLinks.id,
      status: parentStudentLinks.status,
      parentEmail: parentStudentLinks.parentEmail,
      studentName: users.name,
    })
    .from(parentStudentLinks)
    .leftJoin(users, eq(users.id, parentStudentLinks.studentId))
    .where(eq(parentStudentLinks.inviteToken, token))
    .limit(1);

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-3xl mx-auto px-5 md:px-6 h-16 flex items-center">
          <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
            Northstar
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-lg">{body}</div>
      </main>
    </div>
  );

  if (!link || link.status !== "invited") {
    return shell(
      <>
        <SectionLabel className="mb-4">Invitation</SectionLabel>
        <TwoTone as="h1" size="lg" className="mb-6">
          <em>This invitation</em> is no longer open.
        </TwoTone>
        <p className="text-[0.98rem] text-gray-strong leading-relaxed mb-8">
          It may already have been accepted, or the student may have withdrawn
          it. Ask them to send a new one from their settings.
        </p>
        <Link href="/" className="text-[0.95rem] text-ink underline underline-offset-4">
          Go to Northstar
        </Link>
      </>,
    );
  }

  const viewer = await getViewer();
  if (!viewer) {
    // Carry the token through sign-up so the link survives account creation.
    redirect(`/sign-up?role=parent&invite=${encodeURIComponent(token)}`);
  }

  const student = link.studentName ?? "A student";

  return shell(
    <>
      <SectionLabel className="mb-4">Invitation</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-6">
        <em>{student}</em> invited you to follow along.
      </TwoTone>

      <Card className="p-6 mb-6">
        <p className="text-[0.95rem] font-medium mb-2">What you&apos;ll see</p>
        <p className="text-[0.95rem] text-gray-strong leading-relaxed mb-5">
          Their progress and deadlines, the schools on their list, and what
          each one would actually cost your family.
        </p>
        <p className="text-[0.95rem] font-medium mb-2">What you won&apos;t</p>
        <p className="text-[0.95rem] text-gray-strong leading-relaxed">
          Their private conversations with the counselor, and their essay
          drafts — unless they choose to share them with you. That boundary is
          enforced in the software, not just described here.
        </p>
      </Card>

      <AcceptInvite token={token} viewerEmail={viewer.email} invitedEmail={link.parentEmail} />
    </>,
  );
}
