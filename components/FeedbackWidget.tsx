"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback } from "@/lib/actions/feedback";

/* The feedback button.

   A small fixed control in the app shell. Nothing routes it to the
   counselor — feedback is operational and an admin reads it by design,
   whereas a counselor conversation is private to the student. Keeping the
   two apart is what lets the admin page show one and never the other. */

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitFeedback({ message, path: pathname });
      if (!result.ok) {
        setError(result.error || "Couldn't send that.");
        return;
      }
      setSent(true);
      setMessage("");
      // Let them read the confirmation before it disappears.
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1600);
    } catch (err) {
      console.error("[feedback] failed:", err);
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Sits above the mobile tab bar rather than behind it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 md:bottom-6 z-40 px-3.5 py-2 rounded-full border border-hairline bg-surface shadow-sm text-[0.8rem] text-gray-strong hover:border-ink hover:text-ink transition-quiet"
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/20 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-5">
            {sent ? (
              <p className="text-[0.95rem] py-6 text-center">
                Thank you — that reached us.
              </p>
            ) : (
              <>
                <h2 className="text-[1.05rem] font-semibold tracking-tight mb-1">
                  Tell us what&apos;s wrong, or what&apos;s missing
                </h2>
                <p className="text-[0.85rem] text-gray-mid mb-4">
                  Goes straight to the people building Northstar. We&apos;ll see
                  which page you were on.
                </p>
                <textarea
                  autoFocus
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Something confusing, something broken, something you wish it did…"
                  className="w-full px-3 py-2.5 border border-hairline rounded-lg bg-paper text-[0.95rem] focus:outline-none focus:border-ink transition-quiet resize-y"
                />
                {error && (
                  <p role="alert" className="mt-3 text-[0.85rem] border-l-2 border-ink pl-3">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-[0.9rem] text-gray-mid hover:text-ink transition-quiet"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || !message.trim()}
                    className="px-4 py-2 rounded-lg bg-ink text-paper text-[0.9rem] disabled:opacity-50 transition-quiet"
                  >
                    {busy ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
