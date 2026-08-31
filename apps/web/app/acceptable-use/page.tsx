import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { LEGAL_CONTACT_EMAIL, LEGAL_DOC_META } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Acceptable Use",
  description: LEGAL_DOC_META["acceptable-use"].description,
};

export default function AcceptableUsePage() {
  return (
    <LegalPageShell docId="acceptable-use">
      <LegalSection title="1. Purpose">
        <p>
          This Acceptable Use Policy (“AUP”) is part of the{" "}
          <a className="text-violet-400 underline" href="/terms">
            Terms of Service
          </a>
          . It states what you may and may not do with Papuc.
        </p>
      </LegalSection>

      <LegalSection title="2. Allowed use">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Create projects and run deal scenarios for your own evaluation;
          </li>
          <li>
            Import or reference listings you have a legitimate interest in
            reviewing;
          </li>
          <li>
            Use public social features (follow, watch, share) in good faith;
          </li>
          <li>
            Invite collaborators on plans that include that feature, with their
            consent.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Prohibited use">
        <p>You may not:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Use Papuc as an unlicensed MLS/IDX website, listing syndication
            service, or substitute for a brokerage display you are not
            authorized to operate;
          </li>
          <li>
            Scrape, spider, or systematically harvest Papuc, or bulk-export our
            compiled listing corpus for resale or competing products;
          </li>
          <li>
            Republish third-party listing photos, agent remarks, or copyrighted
            descriptions outside the sharing features we provide, or in
            violation of source or vendor terms;
          </li>
          <li>
            Misrepresent Papuc outputs as official MLS data, lender quotes,
            appraisals, or investment advice;
          </li>
          <li>
            Use the Service for FCRA or similar eligibility determinations
            (credit, insurance, employment, housing eligibility, etc.);
          </li>
          <li>
            Offer or solicit securities, pooled investments, or capital raises
            through Papuc unless we expressly enable a compliant product and you
            meet legal requirements;
          </li>
          <li>
            Harass, spam, impersonate others, or upload malware;
          </li>
          <li>
            Circumvent plan limits, rate limits, or access controls;
          </li>
          <li>
            Violate any applicable law, including real-estate licensing and
            anti-fraud rules.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Listing and data sources">
        <p>
          When Papuc retrieves publicly available web pages or property-record
          data via vendors, you agree to use results only for lawful personal or
          internal evaluation consistent with our{" "}
          <a className="text-violet-400 underline" href="/data-disclaimer">
            Data &amp; Listings Disclaimer
          </a>
          . You remain responsible for how you use and share that information.
        </p>
      </LegalSection>

      <LegalSection title="5. Enforcement">
        <p>
          We may investigate violations, remove content, suspend accounts, and
          cooperate with law enforcement. Report abuse to{" "}
          <a
            className="text-violet-400 underline"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
