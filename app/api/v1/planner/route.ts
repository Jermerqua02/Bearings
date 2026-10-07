/* ————————————————————————————————————————
   GET /api/v1/planner

   The numbers at the top of the planner: GPA from the course rows, the GPA
   the transcript prints for itself (which wins when it exists), and the
   rigor count. From lib/coursework — the file that exists so this
   arithmetic has exactly one implementation.
   ———————————————————————————————————————— */

import { requireStudent } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { gpaFrom, gradePoints } from "@/lib/coursework";
import { COMMON_APP } from "@/lib/packet";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("planner", "We couldn't load your planner.", async () => {
  const viewer = await requireStudent();
  const snap = await loadSnapshot(viewer);
  const courses = snap.coursePlan;
  const reported = snap.transcripts.find((t) => t.reportedGpa?.unweighted != null)?.reportedGpa ?? null;
  const advanced = courses.filter((c) => c.level === "ap" || c.level === "ib");
  return {
    computed: gpaFrom(courses),
    reported,
    rigor: {
      advanced: advanced.length,
      ahead: advanced.filter((c) => c.status !== "completed").length,
    },
    gradeOptions: Object.keys(gradePoints),
    limits: { activitySlots: COMMON_APP.activitySlots, descriptionChars: COMMON_APP.descriptionChars },
  };
});

