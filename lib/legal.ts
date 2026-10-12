/* ————————————————————————————————————————
   Legal document identity and versioning.

   Two jobs:

   1. One place to change the company details that appear in both documents.
      They are referenced, never retyped, so Terms and Privacy can't drift
      apart on who the operator is or how to reach them.

   2. Versioning. Consent is only worth something if you can say *what* was
      consented to. Every acceptance is stored against these version strings
      (see legalConsents in lib/db/schema.ts), so bump the version whenever
      the substance of a document changes — not for typo fixes. If you bump
      one, set its effective date in the same edit.

   The FILL_ME sentinel below is deliberate: values that a lawyer or the
   owner still has to supply render as a visible marker rather than as
   plausible-looking text, and `hasUnfilledPlaceholders` lets the pages warn
   loudly outside production instead of quietly shipping a blank.
   ———————————————————————————————————————— */

/**
 * Marks a value that must be supplied before these documents are relied on.
 *
 * Registered here as well as rendered, so hasUnfilledPlaceholders() reports
 * on what is actually missing rather than pattern-matching the text — a
 * check that breaks the moment someone edits the wording.
 */
const UNFILLED = new Set<string>();
const FILL_ME = (what: string) => {
  const value = `(${what})`;
  UNFILLED.add(value);
  return value;
};

export const COMPANY = {
  /** The operating entity. Lumni is the product; Prompt LLC is the company. */
  legalName: "Prompt LLC",
  productName: "Lumni",

  /* —— Review these four before launch —————————————————————————— */

  /**
   * Postal address. Required by CAN-SPAM on commercial email, expected by
   * app stores, and where a legal notice would be served.
   *
   * Deliberately a placeholder. The owner's home address was here briefly;
   * publishing where someone lives, in two documents on the open web, on a
   * product used by teenagers, is not a trade worth making for a field
   * nobody reads. A registered-agent service, PO box, or virtual office
   * satisfies the same requirements for about $50–150 a year.
   */
  address: FILL_ME("address needed here"),
  /** The US state whose law governs, and whose courts hear disputes. */
  governingLawState: "Washington",
  /**
   * Venue: where a dispute is physically heard — the county and state an
   * arbitration or lawsuit would take place in. Kirkland is in King County,
   * so a dispute stays local rather than dragging either party across the
   * country, which is the point of naming one.
   */
  venue: "King County, Washington",

  /* ——————————————————————————————————————————————————————————— */

  // One inbox for now; privacy and legal requests land there too.
  supportEmail: "support@trylumni.com",
  privacyEmail: "support@trylumni.com",
  legalEmail: "support@trylumni.com",
} as const;

/** Bump when the substance changes. Stored with every acceptance. */
/*
  Bumped for the rename. Arguably a borderline call — the operator, the
  terms and the commitments are all unchanged, and only the product's name
  moved. But the agreement identifies the Service by name, and consent is
  only worth something if you can say what was consented to: an acceptance
  recorded against 2026-08-09 points at a document that named a different
  service. Cheap to do now, and the alternative is a record that quietly
  stops matching the text it was given for.
*/
/*
  2026-10-10: the product is Lumni; Lumni Pro, App Store subscriptions and
  trials, refunds through Apple, free access and school licenses; linking by
  code, one to one, with Pro shared across the link; Pro's fair-use limits on
  AI features. (The fair-use paragraph was added within the hour this version
  went live, before anyone had accepted it, so the version stands.)
*/
export const TERMS_VERSION = "2026-10-10";
export const PRIVACY_VERSION = "2026-10-10";

/** Shown at the top of each document. Keep in step with the versions above. */
export const TERMS_EFFECTIVE = "October 10, 2026";
export const PRIVACY_EFFECTIVE = "October 10, 2026";

/**
 * Minimum age to hold an account.
 *
 * 13 is a deliberate line, not an arbitrary one. COPPA attaches to operators
 * who knowingly collect personal information from children under 13 and
 * requires verifiable parental consent — a materially different product.
 * Lumni serves high schoolers, so the documents state plainly that the
 * service is not directed to under-13s, and signup enforces it.
 */
export const MINIMUM_AGE = 13;

/** True when any value above is still a placeholder. */
export function hasUnfilledPlaceholders(): boolean {
  return Object.values(COMPANY).some((v) => typeof v === "string" && UNFILLED.has(v));
}

/** Which fields still need a real answer — for the admin attention list. */
export function unfilledFields(): string[] {
  return Object.entries(COMPANY)
    .filter(([, v]) => typeof v === "string" && UNFILLED.has(v))
    .map(([k]) => k);
}

/** The documents a user must accept to create an account. */
export const REQUIRED_CONSENTS = [
  { document: "terms" as const, version: TERMS_VERSION },
  { document: "privacy" as const, version: PRIVACY_VERSION },
];
