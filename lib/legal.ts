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

/** Marks a value that must be supplied before these documents are relied on. */
const FILL_ME = (what: string) => `⟦ ${what} ⟧`;

export const COMPANY = {
  /** The operating entity. Northstar is the product; Prompt LLC is the company. */
  legalName: "Prompt LLC",
  productName: "Northstar",

  /* —— Review these four before launch —————————————————————————— */

  /** Postal address. Required by CAN-SPAM and by most app stores. */
  address: FILL_ME("Prompt LLC mailing address"),
  /** The US state whose law governs, and whose courts hear disputes. */
  governingLawState: FILL_ME("state, e.g. Washington"),
  /** The county + state for the venue clause. */
  venue: FILL_ME("county and state"),

  /* ——————————————————————————————————————————————————————————— */

  supportEmail: "support@promptllc.com",
  privacyEmail: "privacy@promptllc.com",
  legalEmail: "legal@promptllc.com",
} as const;

/** Bump when the substance changes. Stored with every acceptance. */
export const TERMS_VERSION = "2026-08-09";
export const PRIVACY_VERSION = "2026-08-09";

/** Shown at the top of each document. Keep in step with the versions above. */
export const TERMS_EFFECTIVE = "August 9, 2026";
export const PRIVACY_EFFECTIVE = "August 9, 2026";

/**
 * Minimum age to hold an account.
 *
 * 13 is a deliberate line, not an arbitrary one. COPPA attaches to operators
 * who knowingly collect personal information from children under 13 and
 * requires verifiable parental consent — a materially different product.
 * Northstar serves high schoolers, so the documents state plainly that the
 * service is not directed to under-13s, and signup enforces it.
 */
export const MINIMUM_AGE = 13;

/** True when any value above is still a placeholder. */
export function hasUnfilledPlaceholders(): boolean {
  return Object.values(COMPANY).some((v) => typeof v === "string" && v.startsWith("⟦"));
}

/** The documents a user must accept to create an account. */
export const REQUIRED_CONSENTS = [
  { document: "terms" as const, version: TERMS_VERSION },
  { document: "privacy" as const, version: PRIVACY_VERSION },
];
