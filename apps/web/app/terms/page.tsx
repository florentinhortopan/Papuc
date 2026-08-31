import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { LEGAL_CONTACT_EMAIL, LEGAL_DOC_META } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: LEGAL_DOC_META.terms.description,
};

export default function TermsPage() {
  return (
    <LegalPageShell docId="terms">
      <LegalSection title="1. Agreement">
        <p>
          These Terms of Service (“Terms”) are a contract between you and Papuc
          (“Papuc,” “we,” “us”) governing access to papuc.app and related apps,
          APIs, and services (the “Service”). By creating an account, clicking
          “I agree,” or using the Service, you accept these Terms, our{" "}
          <a className="text-violet-400 underline" href="/privacy">
            Privacy Policy
          </a>
          , and our{" "}
          <a className="text-violet-400 underline" href="/acceptable-use">
            Acceptable Use Policy
          </a>
          .
        </p>
        <p>
          If you use Papuc on behalf of an organization, you represent that you
          have authority to bind that organization.
        </p>
      </LegalSection>

      <LegalSection title="2. What Papuc is (and is not)">
        <p>
          Papuc is <strong className="text-white">software</strong> that helps
          you evaluate rental and related real-estate investment scenarios
          (for example DSCR, cash flow, and returns), scout candidate
          properties using third-party data sources or information you provide,
          and optionally collaborate with other users (follow, watch public
          projects, share links, and—on paid plans—invite collaborators).
        </p>
        <p>Papuc is <strong className="text-white">not</strong>:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>a real estate broker, agent, or brokerage;</li>
          <li>
            a Multiple Listing Service (MLS), IDX display, or official listing
            portal;
          </li>
          <li>
            an investment adviser, broker-dealer, crowdfunding portal, or
            securities exchange;
          </li>
          <li>
            a lender, appraiser, inspector, or tax, legal, or accounting
            adviser.
          </li>
        </ul>
        <p>
          No client, dual-agency, fiduciary, or advisory relationship is created
          by using Papuc. See also our{" "}
          <a className="text-violet-400 underline" href="/data-disclaimer">
            Data &amp; Listings Disclaimer
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility">
        <p>
          You must be at least 18 years old and able to form a binding contract.
          The Service is intended for lawful personal or business use related to
          evaluating real estate investments. You are responsible for complying
          with laws that apply to you (including licensing laws if you are a
          real estate professional).
        </p>
      </LegalSection>

      <LegalSection title="4. Accounts">
        <p>
          We use Google OAuth via Supabase Auth. You must keep your account
          secure and accurate. You are responsible for activity under your
          account. We may suspend or terminate accounts that violate these Terms
          or the Acceptable Use Policy.
        </p>
      </LegalSection>

      <LegalSection title="5. Plans and payment">
        <p>
          Papuc may offer Free and Pro (or other) tiers. Feature limits—such as
          project caps, background scouting, exports, or collaborator
          invites—are described in the product. Paid billing (when enabled) is
          handled by our payment processor; fees, renewals, and cancellations
          will be shown at checkout. Admin-granted Pro access may be revoked.
        </p>
      </LegalSection>

      <LegalSection title="6. Your content and public sharing">
        <p>
          You retain ownership of prompts, project settings, notes, and other
          content you submit (“User Content”). You grant Papuc a worldwide,
          non-exclusive license to host, process, display, and distribute User
          Content as needed to operate the Service (including public projects
          and share links you enable).
        </p>
        <p>
          If you mark a project public or share a link, you understand others
          may view associated deals and metrics. You represent that you have the
          rights to share what you publish and that doing so does not violate
          law or third-party rights (including listing photo and remark
          copyrights).
        </p>
      </LegalSection>

      <LegalSection title="7. Third-party data and models">
        <p>
          The Service may retrieve property or listing-related information from
          third-party providers (for example automated retrieval of publicly
          available web pages, property-record APIs, rent or STR estimates, and
          AI model providers). Those sources may be incomplete, stale, or
          inaccurate. Papuc does not warrant listing status, price, or
          availability.
        </p>
        <p>
          Model outputs (DSCR, cash-on-cash, condition notes, rankings, and
          similar) are <strong className="text-white">estimates</strong> for
          evaluation only—not appraisals, lender quotes, or offers to buy or
          sell property. Always verify with primary sources, your agent, and a
          licensed lender before acting.
        </p>
        <p>
          You must not use Papuc outputs to make credit, insurance, employment,
          housing eligibility, or other decisions regulated by the Fair Credit
          Reporting Act (FCRA) or similar laws.
        </p>
      </LegalSection>

      <LegalSection title="8. Social features">
        <p>
          Follow, watch, public feeds, and collaborator invites are tools for
          sharing evaluation work. They do not create a partnership, joint
          venture, or securities offering. Any future features involving capital
          commitments or pooled investing will be subject to additional terms
          and applicable securities laws; do not treat current social features as
          an invitation to invest through Papuc.
        </p>
      </LegalSection>

      <LegalSection title="9. Intellectual property">
        <p>
          Papuc, its software, branding, and documentation are owned by us or
          our licensors. Third-party listing content, photos, and trademarks
          remain with their owners. You may not scrape, bulk-export, or
          republish Papuc’s compiled datasets except as the product expressly
          allows (for example exporting your own pro-forma).
        </p>
      </LegalSection>

      <LegalSection title="10. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT. We do not guarantee uninterrupted service or
          error-free data.
        </p>
      </LegalSection>

      <LegalSection title="11. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAPUC AND ITS OPERATORS WILL
          NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, OR GOODWILL, ARISING FROM
          YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO
          THE SERVICE WILL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID US FOR
          THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED
          U.S. DOLLARS (US $100).
        </p>
      </LegalSection>

      <LegalSection title="12. Indemnity">
        <p>
          You will defend and indemnify Papuc against claims arising from your
          User Content, your misuse of listing or third-party data, your
          violation of these Terms or law, or your use of Papuc in connection
          with unlicensed brokerage, unregistered securities offerings, or
          similar activity.
        </p>
      </LegalSection>

      <LegalSection title="13. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or
          terminate access for violations, risk, or operational reasons. Some
          sections survive termination (including IP, disclaimers, liability
          limits, and indemnity).
        </p>
      </LegalSection>

      <LegalSection title="14. Changes">
        <p>
          We may update these Terms by posting a new version and updating the
          version date. Material changes may require you to re-accept before
          continuing to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p>
          Questions:{" "}
          <a
            className="text-violet-400 underline"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          or{" "}
          <a className="text-violet-400 underline" href="/support">
            Support
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
