import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, DocTitle, Emphasis, Section } from "../_components/Doc";
import { COMPANY, MINIMUM_AGE, TERMS_EFFECTIVE, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · Northstar",
  description: `The agreement between you and ${COMPANY.legalName} for use of ${COMPANY.productName}.`,
};

export default function TermsPage() {
  return (
    <article>
      <DocTitle
        title="Terms of Service"
        effective={TERMS_EFFECTIVE}
        version={TERMS_VERSION}
        summary={`These terms are the agreement between you and ${COMPANY.legalName} for use of ${COMPANY.productName}. The short version: Northstar helps you think about college. It is not a counselor, not a guarantee, and it will not write your essays. You own what you write. We do not sell your data.`}
      />

      <Section n={1} title="Who we are and what this covers">
        <p>
          {COMPANY.productName} (the “Service”) is operated by {COMPANY.legalName}
          (“we,” “us,” “our”), a limited liability company with a mailing address
          at {COMPANY.address}. These Terms of Service (“Terms”) govern your
          access to and use of the Service.
        </p>
        <p>
          By creating an account, checking the box that references these Terms,
          or using the Service, you agree to them. If you do not agree, do not
          use the Service. Our{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          is incorporated into these Terms by reference.
        </p>
      </Section>

      <Section n={2} title="What Northstar is — and is not">
        <p>
          The Service provides informational and educational tools for students
          researching colleges: school information, list-building, planning
          tools, and an AI assistant that answers questions, reflects your own
          material back to you, and offers critique.
        </p>
        <Emphasis>
          <strong>Northstar does not provide professional advice.</strong> It is
          not a licensed college counselor, guidance counselor, financial
          advisor, tax advisor, attorney, or mental-health professional. Nothing
          in the Service is professional advice of any kind, and no
          counselor–client, fiduciary, or advisory relationship is created by
          your use of it. Decisions about where to apply, what to study, what to
          pay, and what to borrow are yours. For advice specific to your
          circumstances, consult a qualified professional.
        </Emphasis>
        <Emphasis>
          <strong>We do not guarantee outcomes.</strong> We make no promise,
          representation, or warranty that you will be admitted to any school,
          receive any scholarship, grant, or financial aid, be offered any
          particular price, or achieve any particular result. Admissions
          decisions are made by institutions using criteria we neither control
          nor have access to.
        </Emphasis>
      </Section>

      <Section n={3} title="Eligibility and age">
        <Bullets
          items={[
            <>
              You must be at least {MINIMUM_AGE} years old to create an account.
              The Service is not directed to children under {MINIMUM_AGE}, and we
              do not knowingly permit them to register or knowingly collect their
              personal information.
            </>,
            <>
              If you are under 18, you represent that your parent or legal
              guardian has reviewed and agreed to these Terms on your behalf and
              permits your use of the Service. A parent or guardian who agrees on
              behalf of a minor is responsible for that minor’s use.
            </>,
            <>
              You must provide accurate registration information and keep it
              current.
            </>,
            <>
              If we learn that we have collected personal information from a
              child under {MINIMUM_AGE}, we will delete it. Contact{" "}
              {COMPANY.privacyEmail} if you believe this has happened.
            </>,
          ]}
        />
      </Section>

      <Section n={4} title="Your account">
        <p>
          You are responsible for keeping your password confidential and for all
          activity under your account. Tell us promptly at {COMPANY.supportEmail}
          {" "}if you believe your account has been accessed without your
          permission. We are not liable for losses arising from someone else
          using your credentials, whether or not you authorized it.
        </p>
        <p>
          Do not share an account. Students and parents each need their own,
          because the Service treats them differently — see Section 6.
        </p>
      </Section>

      <Section n={5} title="AI features, and the essay rule">
        <p>
          Parts of the Service use artificial intelligence, including
          third-party large language models, to generate responses. You should
          understand three things about that.
        </p>
        <Bullets
          items={[
            <>
              <strong>AI output can be wrong.</strong> It may be inaccurate,
              incomplete, or out of date, including on deadlines, requirements,
              costs, and statistics. Verify anything that matters directly with
              the institution before relying on it.
            </>,
            <>
              <strong>Your inputs are sent to a model provider</strong> to
              generate a response. What that means for your data is described in
              the{" "}
              <Link href="/privacy" className="text-ink underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </>,
            <>
              <strong>Output is not unique to you.</strong> Other users asking
              similar questions may receive similar responses.
            </>,
          ]}
        />
        <Emphasis>
          <strong>Northstar does not write your application essays.</strong> The
          Service is designed to ask questions, reflect your own writing back to
          you, and offer critique — never to draft or ghostwrite on your behalf.
          You are solely responsible for the integrity of everything you submit
          to an institution and for complying with that institution’s rules on
          outside help and AI use. Misrepresenting authorship to a school is
          your responsibility, not ours, and may carry serious consequences that
          we cannot mitigate.
        </Emphasis>
      </Section>

      <Section n={6} title="Student and parent accounts">
        <p>
          A parent may link to a student’s account with the student’s
          participation. Linking is limited by design: a linked parent sees
          progress, status, deadlines, and cost information, and does not see the
          student’s private conversations with the AI assistant or their essay
          drafts unless the student explicitly shares them.
        </p>
        <p>
          This boundary is enforced in the software, not merely promised here.
          We may change how linking works as the product develops, but we will
          not silently widen what a linked parent can see. A parent or guardian
          exercising legal rights over a minor’s personal information should
          contact {COMPANY.privacyEmail}; those rights are addressed in the
          Privacy Policy and are not the same thing as the in-product linking
          feature.
        </p>
      </Section>

      <Section n={7} title="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            "Use the Service for anything unlawful, or to harass, defraud, or harm anyone.",
            "Submit another person's personal information without their permission.",
            "Attempt to access another user's account or data, probe or breach our security, or circumvent access controls or rate limits.",
            "Scrape, crawl, or bulk-extract content, or use automated means to access the Service except as we expressly permit.",
            "Reverse engineer the Service, or use it to build a competing product, or to train a machine-learning model.",
            "Resell, sublicense, or commercially exploit the Service or its content without our written permission.",
            "Upload malware, or interfere with the operation of the Service or the networks it runs on.",
            "Misrepresent your identity, age, or relationship to a student.",
          ]}
        />
        <p>
          We may investigate suspected violations and may suspend or terminate
          accounts involved in them.
        </p>
      </Section>

      <Section n={8} title="Your content">
        <p>
          “Your Content” means everything you put into the Service: profile and
          academic information, essays and drafts, notes, lists, and messages to
          the AI assistant.
        </p>
        <p>
          <strong>You own Your Content.</strong> We claim no ownership of it. You
          grant us a limited, non-exclusive, worldwide, royalty-free license to
          host, store, reproduce, transmit, display, and process Your Content for
          the sole purposes of operating, securing, and improving the Service for
          you — including sending it to the model providers described in the
          Privacy Policy so the AI features can respond.
        </p>
        <p>
          That license exists so we can run the product, and for no other reason.
          It ends when you delete the content or your account, subject to
          reasonable backup retention. We do not sell Your Content, use it for
          advertising, or license it to third parties for their own purposes.
        </p>
        <p>
          You are responsible for Your Content and represent that you have the
          rights to submit it.
        </p>
      </Section>

      <Section n={9} title="Our content and intellectual property">
        <p>
          The Service — its software, design, text, and organization — belongs to{" "}
          {COMPANY.legalName} and its licensors, and is protected by
          intellectual-property law. We grant you a personal, non-exclusive,
          non-transferable, revocable license to use the Service for its intended
          purpose. All rights not expressly granted are reserved.
        </p>
        <p>
          School names, logos, and trademarks belong to their institutions. Their
          appearance in the Service is descriptive and does not imply
          affiliation, sponsorship, or endorsement in either direction.
        </p>
      </Section>

      <Section n={10} title="Third-party information and links">
        <p>
          The Service presents information about institutions drawn from public
          sources, third-party data providers, and the institutions themselves.
          Data of this kind is frequently incomplete, lagging, or inconsistent
          between sources — admission rates, test ranges, costs, aid figures, and
          deadlines especially.
        </p>
        <p>
          We do not warrant the accuracy, completeness, or timeliness of any of
          it. Confirm anything you are going to act on with the institution
          directly. Links to third-party sites are provided for convenience; we
          do not control and are not responsible for them.
        </p>
      </Section>

      <Section n={11} title="Fees">
        <p>
          Where the Service is offered free of charge, we may change that on
          notice, and we may introduce paid features. We will not start charging
          you for something you are already using without telling you first and
          giving you the chance to decline. Any paid terms — price, billing
          period, refunds — will be disclosed at the point of purchase and become
          part of these Terms.
        </p>
      </Section>

      <Section n={12} title="Changes to the Service">
        <p>
          We may add, change, suspend, or discontinue features at any time. We
          will give reasonable notice of material adverse changes where we
          practicably can. You can export your data at any time from Settings,
          and we encourage you to keep your own copy of anything important.
        </p>
      </Section>

      <Section n={13} title="Termination">
        <p>
          You may stop using the Service and delete your account at any time from
          Settings. We may suspend or terminate your access if you materially
          breach these Terms, if we are required to by law, or if continuing to
          provide the Service to you would expose us or other users to
          meaningful risk. Where circumstances allow, we will tell you why.
        </p>
        <p>
          Sections 8 through 18 survive termination.
        </p>
      </Section>

      <Section n={14} title="Disclaimer of warranties">
        <Emphasis>
          <p className="mb-3">
            THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT
            PERMITTED BY LAW, {COMPANY.legalName.toUpperCase()} DISCLAIMS ALL
            WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
            FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          </p>
          <p>
            WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR
            ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT ANY INFORMATION
            OR AI-GENERATED OUTPUT IS ACCURATE, COMPLETE, OR RELIABLE. SOME
            JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES, SO
            SOME OF THIS MAY NOT APPLY TO YOU.
          </p>
        </Emphasis>
      </Section>

      <Section n={15} title="Limitation of liability">
        <Emphasis>
          <p className="mb-3">
            TO THE FULLEST EXTENT PERMITTED BY LAW,{" "}
            {COMPANY.legalName.toUpperCase()} AND ITS MEMBERS, OFFICERS,
            EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES,
            OR FOR ANY LOSS OF PROFITS, DATA, GOODWILL, EDUCATIONAL OPPORTUNITY,
            SCHOLARSHIP, FINANCIAL AID, OR ADMISSION, ARISING OUT OF OR RELATING
            TO THESE TERMS OR THE SERVICE, WHETHER BASED IN CONTRACT, TORT,
            NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE, AND WHETHER OR NOT WE
            HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p className="mb-3">
            OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE
            WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE
            TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE
            HUNDRED US DOLLARS ($100).
          </p>
          <p>
            SOME JURISDICTIONS DO NOT ALLOW THE LIMITATION OR EXCLUSION OF
            LIABILITY FOR INCIDENTAL OR CONSEQUENTIAL DAMAGES, SO SOME OF THIS
            MAY NOT APPLY TO YOU. NOTHING HERE LIMITS LIABILITY THAT CANNOT BE
            LIMITED BY LAW, INCLUDING FOR FRAUD, GROSS NEGLIGENCE, OR WILLFUL
            MISCONDUCT.
          </p>
        </Emphasis>
      </Section>

      <Section n={16} title="Indemnification">
        <p>
          You agree to indemnify and hold harmless {COMPANY.legalName} and its
          members, officers, employees, and agents from any claims, damages,
          losses, liabilities, and reasonable legal fees arising out of your
          misuse of the Service, your violation of these Terms or of any law, or
          your infringement of anyone’s rights. We will notify you of any such
          claim and may participate in its defense with counsel of our choosing.
        </p>
      </Section>

      <Section n={17} title="Governing law and disputes">
        <p>
          These Terms are governed by the laws of the State of{" "}
          {COMPANY.governingLawState}, without regard to its conflict-of-laws
          rules.
        </p>
        <p>
          <strong>Talk to us first.</strong> Before filing anything, email{" "}
          {COMPANY.legalEmail} with a description of the dispute and what you
          want. We will try in good faith to resolve it within 60 days. Most
          problems end here.
        </p>
        <p>
          If that fails, you and {COMPANY.legalName} agree that any dispute will
          be resolved by binding individual arbitration administered by the
          American Arbitration Association under its Consumer Arbitration Rules,
          in {COMPANY.venue} or by videoconference. Judgment on the award may be
          entered in any court with jurisdiction.
        </p>
        <Emphasis>
          <strong>
            You and {COMPANY.legalName} each waive the right to a jury trial and
            to participate in a class, collective, or representative action.
          </strong>{" "}
          Disputes will be brought only in an individual capacity. If this waiver
          is found unenforceable as to a particular claim, that claim proceeds in
          court in {COMPANY.venue} and the rest of this section still applies to
          all other claims.
        </Emphasis>
        <p>
          <strong>Exceptions.</strong> Either party may bring an individual claim
          in small-claims court, and either party may seek injunctive relief in
          court to protect intellectual property or address unauthorized access.
          Nothing here prevents you from reporting a concern to a government
          agency.
        </p>
        <p>
          <strong>Opting out of arbitration.</strong> You may reject the
          arbitration and class-waiver terms by emailing {COMPANY.legalEmail}{" "}
          within 30 days of first accepting these Terms, with your name and the
          email on your account. Opting out costs you nothing else — the rest of
          these Terms still apply, and we will not treat you differently for it.
        </p>
      </Section>

      <Section n={18} title="Changes to these Terms">
        <p>
          We may update these Terms. When we make a material change we will
          update the version and effective date above and give notice in the
          product or by email before it takes effect, and — where the change is
          significant — ask you to accept the new version. Continuing to use the
          Service after a change takes effect means you accept it. Every
          acceptance is recorded against the version you saw.
        </p>
      </Section>

      <Section n={19} title="General">
        <Bullets
          items={[
            "These Terms and the Privacy Policy are the entire agreement between you and us about the Service.",
            "If a provision is unenforceable, the rest stays in effect and the provision is limited to the minimum extent necessary.",
            "Our not enforcing a provision is not a waiver of it.",
            "You may not assign these Terms; we may assign them in connection with a merger, acquisition, or sale of assets.",
            "Nothing in these Terms creates a partnership, agency, or employment relationship, or gives rights to any third party.",
          ]}
        />
      </Section>

      <Section n={20} title="Contact">
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY.address}
          <br />
          General and account questions: {COMPANY.supportEmail}
          <br />
          Legal notices: {COMPANY.legalEmail}
          <br />
          Privacy requests: {COMPANY.privacyEmail}
        </p>
      </Section>
    </article>
  );
}
