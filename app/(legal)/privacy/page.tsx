import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, DocTitle, Emphasis, Section } from "../_components/Doc";
import { COMPANY, MINIMUM_AGE, PRIVACY_EFFECTIVE, PRIVACY_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · Northstar",
  description: `How ${COMPANY.legalName} collects, uses, and protects information in ${COMPANY.productName}.`,
};

export default function PrivacyPage() {
  return (
    <article>
      <DocTitle
        title="Privacy Policy"
        effective={PRIVACY_EFFECTIVE}
        version={PRIVACY_VERSION}
        summary="Most of our users are minors, so we hold this to a higher standard than the law requires. We do not sell personal information. We do not use student data to train AI models. We do not run advertising. A linked parent cannot read a student's private conversations or drafts. Those are architectural facts about the product, not just promises on this page."
      />

      <Section n={1} title="Who this covers">
        <p>
          This policy explains how {COMPANY.legalName} (“we,” “us,” “our”)
          handles personal information in {COMPANY.productName} (the “Service”).
          {COMPANY.legalName} is the controller of that information. Our mailing
          address is {COMPANY.address}, and privacy questions go to{" "}
          {COMPANY.privacyEmail}.
        </p>
        <p>
          It applies to students, to parents and guardians, and to visitors to
          our website. It works alongside our{" "}
          <Link href="/terms" className="text-ink underline underline-offset-4">
            Terms of Service
          </Link>
          .
        </p>
      </Section>

      <Section n={2} title="What we collect">
        <p>
          <strong>Information you give us.</strong>
        </p>
        <Bullets
          items={[
            <>
              <strong>Account:</strong> name, email address, password (stored
              only as a salted hash — we never see it), and whether you are a
              student or a parent.
            </>,
            <>
              <strong>Academic and profile information</strong> a student
              chooses to enter: grade level, coursework and GPA, test scores,
              activities, intended fields of study, location and cost
              preferences, and family financial context used to estimate net
              price.
            </>,
            <>
              <strong>Work product:</strong> school lists, application status,
              essay drafts and notes, planning entries, and interview practice.
            </>,
            <>
              <strong>Messages to the AI assistant,</strong> and its responses.
            </>,
            <>
              <strong>Correspondence</strong> when you contact support.
            </>,
          ]}
        />
        <p>
          <strong>Information we collect automatically.</strong>
        </p>
        <Bullets
          items={[
            <>
              <strong>Session and security data:</strong> IP address, browser and
              device type, and timestamps for sign-in, session, and consent
              records. We keep the IP address and user agent recorded when you
              accepted our Terms as evidence of that consent.
            </>,
            <>
              <strong>Usage data:</strong> which features are used and when, and
              the token counts and computed cost of AI calls so we can meter
              expense and detect abuse.
            </>,
            <>
              <strong>Diagnostic logs</strong> generated when something errors.
            </>,
          ]}
        />
        <Emphasis>
          We do not collect precise geolocation, do not use advertising or
          cross-site tracking technologies, do not run third-party analytics that
          profile you across the web, and do not buy personal information about
          you from data brokers.
        </Emphasis>
      </Section>

      <Section n={3} title="Why we use it">
        <p>We use personal information only to:</p>
        <Bullets
          items={[
            "Provide the Service — build your list, plan coursework, estimate costs, and answer your questions.",
            "Personalize what you see to your own profile, which is the entire point of the product.",
            "Authenticate you and keep accounts secure.",
            "Meter and control our own operating costs, including AI usage.",
            "Detect, investigate, and prevent abuse, fraud, and security incidents.",
            "Respond to your support requests.",
            "Fix bugs and improve the product in aggregate.",
            "Comply with law and enforce our Terms.",
          ]}
        />
        <p>
          Where the GDPR or similar law applies, our legal bases are performance
          of our contract with you, our legitimate interests in securing and
          improving the Service, your consent where we ask for it, and
          compliance with legal obligations.
        </p>
      </Section>

      <Section n={4} title="AI processing">
        <p>
          To answer a question, critique an essay, or explain why a school might
          fit, we send the relevant parts of your input and profile to a
          third-party AI model provider, currently Anthropic, PBC, which
          processes it and returns a response.
        </p>
        <p>
          <strong>Read-aloud is separate.</strong> If you press &ldquo;Read
          aloud&rdquo; to hear your profile summary spoken, the text of that
          summary is sent to Google (Gemini) to synthesize the audio, because our
          primary provider does not offer speech. Nothing else is sent — not your
          essays, not your counselor conversations — and it happens only when you
          press the button. If you would rather nothing leave your device, your
          browser can read the text aloud itself; the feature falls back to that
          automatically when the hosted voice is unavailable.
        </p>
        <Bullets
          items={[
            <>
              We use the provider’s <strong>commercial API under terms that
              prohibit training</strong> on data submitted through it. Your
              essays and conversations are not used to train anyone’s model —
              not the provider’s, and not ours.
            </>,
            <>
              We send what the feature needs, not your whole record.
            </>,
            <>
              The provider may retain the request briefly for abuse monitoring
              under its own terms, and acts as our processor.
            </>,
            <>
              If we change providers, we will update this policy and hold the new
              one to the same no-training standard.
            </>,
          ]}
        />
      </Section>

      <Section n={5} title="How we share information">
        <Emphasis>
          <strong>
            We do not sell personal information, and we do not share it for
            cross-context behavioral advertising.
          </strong>{" "}
          We never have. Under the CCPA and comparable state laws, we have not
          sold or shared personal information in the preceding twelve months,
          including that of anyone under 16.
        </Emphasis>
        <p>We disclose information only in these situations:</p>
        <Bullets
          items={[
            <>
              <strong>Service providers</strong> that run the product on our
              behalf, bound by contract to use it only for that purpose: our
              hosting and database provider (Railway), our AI model provider
              (Anthropic), our email provider (Resend, for password resets and
              notifications), and Google (Gemini) for read-aloud speech only.
              Each receives the minimum needed for its job.
            </>,
            <>
              <strong>A linked parent or guardian,</strong> within the limits in
              Section 6.
            </>,
            <>
              <strong>When you tell us to</strong> — for example, sharing an
              essay with a parent or exporting your data.
            </>,
            <>
              <strong>Legal compliance:</strong> to comply with valid legal
              process, or where necessary to protect the rights, safety, or
              property of a user, the public, or us. Where we are legally
              permitted, we will attempt to notify the affected user first.
            </>,
            <>
              <strong>Business transfer:</strong> if the company is acquired or
              merged, information may transfer to the successor, which will
              remain bound by this policy or give notice and a choice before
              materially changing it.
            </>,
          ]}
        />
      </Section>

      <Section n={6} title="Students, parents, and the boundary between them">
        <p>
          A parent may link to a student’s account with the student’s
          participation. Linking is intentionally narrow.
        </p>
        <p>
          <strong>A linked parent can see:</strong> application progress and
          status, deadlines, the school list, and cost and aid information.
        </p>
        <p>
          <strong>A linked parent cannot see:</strong> the student’s private
          conversations with the AI assistant, or their essay drafts — unless the
          student explicitly shares them.
        </p>
        <p>
          This is enforced in our authorization layer, which resolves what a
          viewer may read before any data is loaded, and denies by default.
          Private student content is not sent to a parent’s browser and hidden
          there; it is never sent.
        </p>
        <p>
          Separately from the product feature, a parent or guardian may have
          legal rights over a minor’s personal information. We honor those
          rights — see Section 9. Because exercising them can override the
          in-product boundary above, we verify the relationship first, and,
          except where law forbids it, we tell the student when a guardian
          requests access to their information. We think a teenager deserves to
          know that.
        </p>
      </Section>

      <Section n={7} title="Children under 13">
        <p>
          The Service is intended for high-school students and is not directed to
          children under {MINIMUM_AGE}. We do not knowingly collect personal
          information from them, and account creation requires confirming you
          meet the minimum age.
        </p>
        <p>
          If we learn that we hold personal information from a child under{" "}
          {MINIMUM_AGE} without verifiable parental consent, we delete it
          promptly. If you believe a child under {MINIMUM_AGE} has given us
          information, email {COMPANY.privacyEmail} and we will act on it.
        </p>
        <p>
          We are not a school official and do not operate as a contractor to any
          school district. Students sign up individually, so records here are
          generally not education records under FERPA. If we ever work directly
          with a school, we will handle that data under the agreement with the
          school and say so here.
        </p>
      </Section>

      <Section n={8} title="How long we keep it">
        <Bullets
          items={[
            "Account and profile information: while your account is open.",
            "Essays, lists, and planning data: while your account is open, or until you delete them.",
            "AI conversations: while your account is open, or until you delete a thread.",
            "Consent records: for the life of the account and for three years after closure, because they are the evidence that you agreed to our Terms.",
            "Security and usage logs: up to 24 months, then deleted or aggregated beyond identification.",
          ]}
        />
        <p>
          When you delete your account we delete your personal information within
          30 days, except where we must keep something to comply with law,
          resolve a dispute, or enforce our agreements. Residual copies may
          persist in encrypted backups for up to 90 days before rotating out.
        </p>
      </Section>

      <Section n={9} title="Your rights and choices">
        <p>
          Whoever and wherever you are, you can ask us to:
        </p>
        <Bullets
          items={[
            "Access — get a copy of the personal information we hold about you.",
            "Export — download your data in a portable JSON format, available immediately in Settings.",
            "Correct — fix anything inaccurate, mostly editable directly in the product.",
            "Delete — remove your account and personal information, available in Settings.",
            "Restrict or object to certain processing, and withdraw consent where processing relies on it.",
            "Complain to your data protection authority or state attorney general.",
          ]}
        />
        <p>
          Email {COMPANY.privacyEmail} to exercise a right that isn’t
          self-service. We respond within 45 days (extendable once by 45 days
          where permitted), and 30 days where the GDPR applies. We will verify
          your identity first, and we will not discriminate against you for
          exercising any of this.
        </p>
        <p>
          <strong>California.</strong> The categories in Section 2 correspond to
          CCPA categories including identifiers, education information,
          commercial information, internet activity, and — for financial context
          used in aid estimates — characteristics that may be treated as
          sensitive personal information. We use sensitive personal information
          only to provide the Service and for no purpose requiring a right to
          limit. We do not sell or share personal information. You may designate
          an authorized agent to make a request.
        </p>
        <p>
          <strong>Do Not Track.</strong> We do not track users across third-party
          sites, so there is nothing for a DNT signal to change. We honor Global
          Privacy Control signals as opt-out requests where applicable.
        </p>
      </Section>

      <Section n={10} title="Security">
        <p>
          We protect information with encryption in transit (TLS) and at rest,
          salted and hashed passwords, HTTP-only session cookies with strict
          attributes, an authorization layer that denies by default, and access
          controls that keep student content out of administrative views. Our
          own admin tools are built to show counts and costs, not to read
          essays or conversations.
        </p>
        <p>
          No system is perfectly secure, and we do not claim otherwise. If a
          breach affects your personal information, we will notify you and the
          relevant regulators as required by law, without unreasonable delay. To
          report a vulnerability, email {COMPANY.privacyEmail} — we welcome it and
          will not pursue good-faith researchers.
        </p>
      </Section>

      <Section n={11} title="Cookies">
        <p>
          We use a small number of strictly necessary cookies: a session cookie
          to keep you signed in, and security cookies to protect against
          cross-site request forgery. We do not use advertising, marketing, or
          third-party analytics cookies. Blocking the essential ones will stop
          sign-in from working.
        </p>
      </Section>

      <Section n={12} title="Where information is processed">
        <p>
          We operate in the United States, and information is processed and
          stored there by us and our service providers. If you use the Service
          from outside the US, you understand that your information will be
          transferred to and processed in the US, where privacy law differs from
          your own. Where required, we rely on Standard Contractual Clauses or
          another lawful transfer mechanism.
        </p>
      </Section>

      <Section n={13} title="Changes to this policy">
        <p>
          We may update this policy. When we make a material change we will
          update the version and effective date above and notify you in the
          product or by email before it takes effect. We will not retroactively
          reduce your rights over information already collected without asking
          you first.
        </p>
      </Section>

      <Section n={14} title="Contact">
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY.address}
          <br />
          Privacy: {COMPANY.privacyEmail}
          <br />
          Support: {COMPANY.supportEmail}
        </p>
        <p>
          If you are a student and something here is unclear, write to us and ask.
          You are entitled to understand what happens to your information.
        </p>
      </Section>
    </article>
  );
}
