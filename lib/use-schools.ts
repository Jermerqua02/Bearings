"use client";

/* ————————————————————————————————————————
   Schools the counselor mentioned.

   Resolves ids through the snapshot first — most of what the counselor
   talks about is already on the student's list — and fetches the rest once,
   into a module-level cache shared by every card on the page.

   The cards render after a model round trip that takes tens of seconds, so
   a short fetch behind them is invisible.
   ———————————————————————————————————————— */

import { useEffect, useState } from "react";
import { getSchoolsAction } from "@/lib/actions/schools";
import { useApp } from "@/lib/profile-context";
import type { School } from "@/lib/types";

/** Survives remounts within a page session; ids are stable reference data. */
const cache = new Map<string, School>();
const inFlight = new Map<string, Promise<void>>();

export function useSchools(ids: string[]): Map<string, School> {
  const { schoolById } = useApp();
  const [, bump] = useState(0);

  // Sorted and joined so the effect keys on contents, not array identity.
  const key = [...ids].sort().join(",");

  useEffect(() => {
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !schoolById(id) && !cache.has(id));
    if (missing.length === 0) return;

    const pending = missing.filter((id) => !inFlight.has(id));
    if (pending.length > 0) {
      const p = getSchoolsAction(pending)
        .then((rows) => {
          for (const s of rows) cache.set(s.id, s);
        })
        .catch((err) => console.error("[schools] fetch failed:", err))
        .finally(() => {
          for (const id of pending) inFlight.delete(id);
        });
      for (const id of pending) inFlight.set(id, p);
    }

    let live = true;
    void Promise.all(missing.map((id) => inFlight.get(id)).filter(Boolean)).then(() => {
      if (live) bump((n) => n + 1);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, schoolById]);

  const out = new Map<string, School>();
  for (const id of ids) {
    const s = schoolById(id) ?? cache.get(id);
    if (s) out.set(id, s);
  }
  return out;
}
