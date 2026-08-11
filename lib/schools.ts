/* ————————————————————————————————————————
   Shared school constants.

   Deliberately free of `server-only` and of any database import: the
   explorer's client components need these values too, and a `server-only`
   module can't be imported from the browser half of the app.

   The cycle key is here because two scripts and the query layer all have to
   agree on it. It used to be declared separately in seed.ts and nowhere
   else, which worked only for as long as one script wrote these tables.
   ———————————————————————————————————————— */

/**
 * The admissions cycle these figures describe.
 *
 * `school_admissions`, `school_cost`, and `school_outcome` are keyed by it,
 * so next year's numbers arrive as new rows rather than a migration and an
 * overwrite. Reads filter on it; writes stamp it.
 */
export const CURRENT_CYCLE = "2026-27";
