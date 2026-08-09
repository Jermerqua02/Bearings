/* ————————————————————————————————————————
   Completing onboarding.

   This is the write that was missing. Onboarding collected everything and
   persisted none of it: the flow called setProfile() from
   lib/profile-context.tsx, which is local React state, and the only code
   that ever inserted a student_profile row was scripts/seed.ts.

   Two consequences, both fatal for a real signup:

     1. The last question hung. goNext() awaits summarizeProfileAction(),
        which loads the snapshot and throws "Finish onboarding first." when
        no profile row exists — which was always, during onboarding. The
        rejection skipped the setStepIndex() call, so the flow froze on
        "What matters to you in a campus community?" with no error.

     2. Even past that, the answers lived until the next refresh. The
        counselor would then refuse to talk, for the same missing row.

   The write itself is in lib/db/queries/profile.ts so it can be tested
   without a request context.
   ———————————————————————————————————————— */

"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/policy";
import { saveProfile } from "@/lib/db/queries/profile";
import type { Profile } from "@/lib/types";

export type CompleteResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(profile: Profile): Promise<CompleteResult> {
  try {
    const viewer = await requireViewer();
    await saveProfile(viewer.userId, profile);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("[onboarding] could not save profile:", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : "We couldn't save your answers. Try again.",
    };
  }
}
