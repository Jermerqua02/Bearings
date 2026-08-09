"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { acceptParentInvite } from "@/lib/actions/linking";

export default function AcceptInvite({
  token,
  viewerEmail,
  invitedEmail,
}: {
  token: string;
  viewerEmail: string;
  invitedEmail: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accepting on a different account than the one invited is allowed — people
  // forward mail, and forwarding was probably deliberate — but it should be a
  // conscious act rather than a surprise, so say whose account this will link.
  const mismatch = viewerEmail.toLowerCase() !== invitedEmail.toLowerCase();

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      const result = await acceptParentInvite(token);
      if (!result.ok) {
        setError(result.error || "That didn't work. Ask for a new invitation.");
        return;
      }
      leaving = true;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("[invite] accept failed:", err);
      setError("We couldn't reach the server. Try again in a moment.");
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <div>
      {mismatch && (
        <p className="text-[0.88rem] text-gray-mid leading-relaxed mb-4 border-l-2 border-hairline pl-3">
          This invitation was sent to <strong>{invitedEmail}</strong>, and
          you&apos;re signed in as <strong>{viewerEmail}</strong>. Accepting
          links it to the account you&apos;re signed in as.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3 mb-4">
          {error}
        </p>
      )}

      <Button variant="primary" size="lg" onClick={onAccept} disabled={busy}>
        {busy ? "Linking…" : "Accept the invitation"}
      </Button>
    </div>
  );
}
