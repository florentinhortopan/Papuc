import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { LEGAL_CONTACT_EMAIL, LEGAL_DOC_META } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: LEGAL_DOC_META.privacy.description,
};

export default function PrivacyPage() {
  return (
    <LegalPageShell docId="privacy">
      <LegalSection title="1. Scope">
        <p>
          This Privacy Policy explains how Papuc (“we,” “us”) collects, uses, and
          shares information when you use papuc.app and related apps (the
          “Service”). It applies alongside our{" "}
          <a className="text-violet-400 underline" href="/terms">
            Terms of Service
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-white">Account:</strong> email and basic
            profile fields from Google OAuth via Supabase Auth; optional display
            name you set.
          </li>
          <li>
            <strong className="text-white">Product data:</strong> projects,
            constraints, deals, scores, scenarios, condition estimates, actions
            (saved/dismissed/etc.), follows, project watches, share tokens, and
            similar content you create or that we generate for you.
          </li>
          <li>
            <strong className="text-white">Usage:</strong> approximate device and
            log data needed to operate and secure the Service (for example IP
            address, user agent, and error logs via our host).
          </li>
          <li>
            <strong className="text-white">Communications:</strong> support
            emails and, if enabled, digests or alerts.
          </li>
          <li>
            <strong className="text-white">Payments (when enabled):</strong>{" "}
            billing metadata from our payment processor (we do not store full
            card numbers).
          </li>
          <li>
            <strong className="text-white">Legal acceptance:</strong> timestamp
            and document version when you agree to our Terms, Privacy Policy,
            and Acceptable Use Policy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide, maintain, and improve the Service;</li>
          <li>Authenticate you and personalize your experience;</li>
          <li>
            Run scouting, scoring, and AI features you request (including
            sending prompts and listing context to model providers);
          </li>
          <li>
            Fetch property or listing-related data from third-party providers on
            your behalf;
          </li>
          <li>Send transactional or digest emails you enable;</li>
          <li>Enforce Terms, prevent abuse, and comply with law;</li>
          <li>Communicate about product changes or support.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Processors and third parties">
        <p>We use service providers that process data on our behalf, including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase — authentication and database;</li>
          <li>Vercel — hosting and serverless functions;</li>
          <li>Anthropic (or other LLM providers) — parsing and deal rationales;</li>
          <li>
            HasData, RealEstateAPI, AirROI, and similar vendors — property /
            listing / market data retrieval;
          </li>
          <li>Resend (or similar) — email delivery;</li>
          <li>Payment processors — when paid plans are enabled.</li>
        </ul>
        <p>
          Search parameters, listing URLs, or property identifiers may be sent to
          data vendors so they can return results. We do not sell your personal
          information. If we later use advertising cookies that constitute a
          “sale” or “share” under CCPA, we will update this Policy and provide
          required opt-outs.
        </p>
      </LegalSection>

      <LegalSection title="5. Public sharing">
        <p>
          If you make a project public, share a deal/project link, or appear on
          another user’s feed, certain profile and deal information may be
          visible to other signed-in users or (for public share pages) to anyone
          with the link. Choose visibility carefully.
        </p>
      </LegalSection>

      <LegalSection title="6. Retention">
        <p>
          We retain account and product data while your account is active and as
          needed for backups, disputes, and legal obligations. You may request
          deletion via Support; some residual copies may remain in backups for a
          limited period.
        </p>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>
          We use industry-standard measures appropriate to our size (including
          TLS in transit and access controls via our providers). No method of
          transmission or storage is 100% secure.
        </p>
      </LegalSection>

      <LegalSection title="8. Your choices and rights">
        <ul className="list-disc pl-5 space-y-1">
          <li>Update display name and notification preferences in Settings;</li>
          <li>Disable digests or pause nightly scouts where offered;</li>
          <li>
            Request access, correction, or deletion of personal data by
            contacting us;
          </li>
          <li>
            Depending on your location (e.g. California / EEA), you may have
            additional rights under CCPA/GDPR. We will not discriminate against
            you for exercising privacy rights.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          The Service is not directed to children under 18. We do not knowingly
          collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="10. International transfers">
        <p>
          We may process data in the United States and other countries where our
          providers operate. If you access the Service from elsewhere, you
          consent to that processing as needed to provide the Service.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes">
        <p>
          We may update this Policy by posting a new version. Material changes
          may require re-acceptance before you continue using Papuc.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Privacy requests:{" "}
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
          . Include the email on your Papuc account.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
