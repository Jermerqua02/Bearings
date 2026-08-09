"use client";

/* ————————————————————————————————————————
   Session state — client-side only for now.
   React context, no persistence (per spec: no localStorage).
   ———————————————————————————————————————— */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GradeMode, ListEntry, Profile } from "./types";
import { gradeModeFor } from "./types";

interface AppState {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  mode: GradeMode;
  list: ListEntry[];
  addToList: (entry: ListEntry) => void;
  removeFromList: (schoolId: string) => void;
  moveTier: (schoolId: string, tier: ListEntry["tier"]) => void;
}

const AppContext = createContext<AppState | null>(null);

/** A demo student so every screen renders before onboarding exists. */
export const demoStudent: Profile = {
  role: "student",
  firstName: "Maya",
  gradeLevel: 11,
  gpa: { unweighted: 3.6, weighted: 4.1 },
  rigor: { apCount: 4, ibCount: 0, honorsCount: 3 },
  testScores: { sat: 1310, planningToTest: true },
  intendedMajors: ["Biology"],
  undecided: false,
  activities: [
    {
      id: "a1",
      name: "Science Olympiad",
      role: "Team captain",
      hoursPerWeek: 5,
      weeksPerYear: 30,
      description: "Led a 15-person team; medaled at state in Anatomy & Physiology.",
      yearsInvolved: [9, 10, 11],
      leadership: true,
    },
    {
      id: "a2",
      name: "Hospital volunteering",
      role: "Volunteer",
      hoursPerWeek: 3,
      weeksPerYear: 40,
      description: "Patient transport and family waiting-room support.",
      yearsInvolved: [10, 11],
      leadership: false,
    },
  ],
  geography: { regions: ["midwest", "northeast"], maxDistanceMiles: 500 },
  campus: { sizes: ["medium", "large"], settings: ["college-town", "suburban"] },
  budget: { maxPerYear: 30000, willFileFafsa: true },
  values: ["research-access", "mental-health-support", "study-abroad"],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(demoStudent);
  const [list, setList] = useState<ListEntry[]>([
    { schoolId: "umich", tier: "reach", status: "considering" },
    { schoolId: "case-western", tier: "target", status: "considering" },
    { schoolId: "miami-ohio", tier: "likely", status: "considering" },
  ]);

  const mode: GradeMode = useMemo(() => {
    if (!profile) return "explore";
    const grade =
      profile.role === "student" ? profile.gradeLevel : profile.studentGrade;
    return gradeModeFor(grade);
  }, [profile]);

  const addToList = useCallback((entry: ListEntry) => {
    setList((prev) =>
      prev.some((e) => e.schoolId === entry.schoolId) ? prev : [...prev, entry]
    );
  }, []);

  const removeFromList = useCallback((schoolId: string) => {
    setList((prev) => prev.filter((e) => e.schoolId !== schoolId));
  }, []);

  const moveTier = useCallback(
    (schoolId: string, tier: ListEntry["tier"]) => {
      setList((prev) =>
        prev.map((e) => (e.schoolId === schoolId ? { ...e, tier } : e))
      );
    },
    []
  );

  const value = useMemo(
    () => ({ profile, setProfile, mode, list, addToList, removeFromList, moveTier }),
    [profile, mode, list, addToList, removeFromList, moveTier]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
