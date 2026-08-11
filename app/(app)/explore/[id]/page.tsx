/* ————————————————————————————————————————
   School detail — the server half.

   Resolving the id here rather than in the browser is what makes an unknown
   school a real 404. The page used to be a client component reading
   useParams(), so /explore/not-a-school returned HTTP 200 with a paragraph
   apologising — invisible to anything that reads status codes.

   The lookup is still the curated array; it becomes a database read when the
   query layer lands, and this file is the only place that has to change.
   ———————————————————————————————————————— */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSchool } from "@/lib/data/schools";
import SchoolDetail from "./SchoolDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const school = getSchool(id);
  // The root layout supplies a "%s · Northstar" template — no suffix here.
  if (!school) return { title: "School not found" };
  return {
    title: school.name,
    description: `Net price, admissions range, and what ${school.shortName} is actually like.`,
  };
}

export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const school = getSchool(id);
  if (!school) notFound();

  return <SchoolDetail school={school} />;
}
