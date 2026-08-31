import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";
import { LEGAL_DOC_META } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Data & Listings Disclaimer",
  description: LEGAL_DOC_META["data-disclaimer"].description,
};

export default function DataDisclaimerPage() {
  return (
    <LegalPageShell docId="data-disclaimer">
      <LegalSection title="Short version">
        <p>
          Papuc is software that helps you model rental investments. Property
          information may come from third-party services, publicly available web
          pages, property-record APIs, or information you provide.{" "}
          <strong className="text-white">
            Papuc is not a Multiple Listing Service, not an IDX display, and not
            a real estate brokerage.
          </strong>{" "}
          Listing details can be wrong or outdated. Always verify with the
          listing broker, your agent, and primary sources before making an
          offer. Model outputs (DSCR, cash-on-cash, condition notes, rankings)
          are estimates—not appraisals or lending commitments.
        </p>
      </LegalSection>

      <LegalSection title="Sources we may use">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-white">Public web listing sources</strong>{" "}
            (via vendors such as HasData) — structured copies of information
            that appears on publicly viewable pages. This is{" "}
            <em>not</em> an official MLS/IDX feed and is not licensed MLS data
            merely because it relates to listed properties.
          </li>
          <li>
            <strong className="text-white">Property-record / API providers</strong>{" "}
            (such as RealEstateAPI property search) — may include off-market or
            assessor-style records depending on your plan and their product.
            Premium MLS access, if ever enabled, requires separate broker/MLS
            licensing and will be labeled accordingly.
          </li>
          <li>
            <strong className="text-white">User import</strong> — URLs, addresses,
            or assumptions you enter.
          </li>
          <li>
            <strong className="text-white">Estimate vendors</strong> — rent, STR,
            tax, or similar models that are inherently approximate.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What we do not claim">
        <ul className="list-disc pl-5 space-y-1">
          <li>That Papuc listings are complete, current, or exclusive;</li>
          <li>That Papuc is affiliated with Zillow, any MLS, or any brokerage;</li>
          <li>That using Papuc satisfies IDX or state advertising rules for brokers;</li>
          <li>That scenario results predict actual investment performance.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <p>
          Confirm price, status, disclosures, and photos on the listing’s
          authoritative source. Respect copyright in photos and remarks. Do not
          treat Papuc as permission to operate an unlicensed listing portal. See
          the{" "}
          <a className="text-violet-400 underline" href="/acceptable-use">
            Acceptable Use Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
