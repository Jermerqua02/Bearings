"use client";

import { useState, useTransition } from "react";
import { deleteFeedback, setFeedbackStatus } from "@/lib/actions/admin";

export interface FeedbackRow {
  id: string;
  email: string;
  message: string;
  path: string;
  status: string;
  createdAt: string;
}

export default function FeedbackList({ rows }: { rows: FeedbackRow[] }) {
  const [showResolved, setShowResolved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = showResolved ? rows : rows.filter((r) => r.status === "open");
  const open = rows.filter((r) => r.status === "open").length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) setError(result.error || "That didn't work.");
      } catch (err) {
        console.error("[admin/feedback] action failed:", err);
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span className="text-[0.85rem] text-gray-mid">
          {open} open · {rows.length} total
        </span>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="h-4 w-4 accent-ink cursor-pointer"
          />
          <span className="text-[0.9rem] text-gray-mid">Show resolved</span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-[0.9rem] border-l-2 border-ink pl-3">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="border border-hairline rounded-xl bg-surface p-8 text-center">
          <p className="text-[0.95rem] text-gray-mid">
            {rows.length === 0
              ? "No feedback yet. The button lives at the bottom-right of every signed-in page."
              : "Nothing open. Tick “Show resolved” to see the rest."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <div
              key={r.id}
              className={`border rounded-xl bg-surface p-4 ${
                r.status === "open" ? "border-hairline" : "border-hairline opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
                <span className="text-[0.8rem] text-gray-mid">
                  {new Date(r.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {r.email || "unknown"}
                  {r.path && ` · ${r.path}`}
                  {r.status === "resolved" && " · resolved"}
                </span>
                <span className="flex items-center gap-4">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setFeedbackStatus(r.id, r.status === "open" ? "resolved" : "open"),
                      )
                    }
                    className="text-[0.85rem] text-gray-mid hover:text-ink transition-quiet"
                  >
                    {r.status === "open" ? "Mark resolved" : "Reopen"}
                  </button>
                  {confirming === r.id ? (
                    <span className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(() => deleteFeedback(r.id));
                        }}
                        className="text-[0.85rem] text-ink underline underline-offset-4"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="text-[0.85rem] text-gray-mid hover:text-ink"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(r.id)}
                      className="text-[0.85rem] text-gray-mid hover:text-ink transition-quiet"
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
              <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
