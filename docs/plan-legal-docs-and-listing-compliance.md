# Plan: Papuc Legal Docs, Data Framing & Listing Compliance

**Status:** Draft research plan — **not legal advice**  
**Date:** 2026-08-31  
**Related:** [`prd-freemium-gates.md`](./prd-freemium-gates.md), HasData scout path, RealEstateAPI fallback, social investing Stage 2  
**Required next step:** Retain US real-estate + privacy counsel before publishing final ToS / Privacy / Acceptable Use. This doc is a briefing so counsel and product ship the right *framing*, not a DIY “compliant by disclaimer” pack.

---

## 1. Why this exists

We need website **Terms of Service**, **User Agreement / Acceptable Use**, and **Privacy Policy** that:

1. Fit Papuc as a **DSCR underwriting / deal-scout SaaS**, not a brokerage or securities platform.
2. Honestly cover **listing data provenance** (HasData / Zillow-public pages, RealEstateAPI property records, future true MLS/IDX).
3. Do **not** rely on a fake “HasData loophole” to display MLS-class data without a broker license.
4. Soft-prep **social investing** (public projects Free; friend collab Pro) without implying Papuc is a broker-dealer, syndication portal, or investment adviser.

---

## 2. Research findings (product-relevant)

### 2.1 HasData is **not** a license to use MLS data

| Fact | Implication for Papuc |
|---|---|
| HasData retrieves **publicly viewable web pages** (their Zillow product scrapes Zillow.com) and returns structured JSON. | We get **Zillow-page-derived** fields, not an MLS/IDX feed. |
| HasData states it is **not affiliated** with Zillow; docs say *you* are responsible for compliance where source ToS restrict automated access. | Buying HasData ≠ permission from Zillow or any MLS. |
| HasData ToS (Aug 2026) restrict **reselling / republishing** data without written permission; user **indemnifies** HasData for IP/privacy claims from *your* use of data. | Redisplaying listing photos, agent remarks, and full listing pages to many users is high risk under *HasData’s own* contract, independent of Zillow. |
| HasData AUP: don’t use data in ways that violate **source site ToS**; you’re controller for personal data (GDPR/CCPA); **no FCRA** / eligibility uses. | Papuc must not position outputs as credit/insurance/housing eligibility decisions. |

**Bottom line:** HasData is an **infra/risk-transfer vendor**, not a compliance shield. Framing ToS as “we use HasData so this is legal MLS data” would be false and harmful.

### 2.2 Zillow Terms (source Papuc currently prefers)

Zillow’s Terms of Use prohibit, among other things:

- Automated queries / scraping / crawlers / bypassing CAPTCHA-like measures.
- Using the Services to **develop competitive products or services**.
- Under MLS/VOW-style acknowledgments: copying / **redistributing** listing info beyond personal consideration of a purchase; MLS copyrights in compilations.

Civil contract / IP / unfair-competition exposure is the practical risk for commercial products that automate and redisplay Zillow-sourced listings at scale. Public-page CFAA arguments do **not** make Zillow ToS or MLS copyright issues go away.

### 2.3 True MLS / IDX (what “broker license” actually unlocks)

Official MLS listing display (photos, remarks, status, agent/office) typically requires:

1. A **licensed broker** (or agent under a participant broker) who is an **MLS participant**.
2. An **IDX** (or VOW) agreement with that MLS.
3. **Participant control** of the display (brokerage identity visible, rules on attribution, sold/expired handling, no deceptive co-branding).
4. Often a **vendor/tech provider** agreement with the MLS.

**RealEstateAPI** documents that their **Premium / Local MLS** dataset requires:

- At least one team member who is a **registered agent or broker**.
- A **30–60 day use-case review** against MLS rules.

Papuc code already notes: without MLS upgrade, RealEstateAPI `/PropertySearch` is **off-market / property records**, not full `/MLSSearch` active listing feed. That distinction must appear in product copy and legal docs.

### 2.4 There is no clean “loophole”

| Approach | Legal character | Use for Papuc? |
|---|---|---|
| HasData → Zillow pages → show full listings publicly | High ToS / republish / competitive-use risk | **Do not treat as compliant MLS path** |
| Claim “public data so IDX rules don’t apply” while showing MLS-looking inventory | Misleading; still Zillow/MLS IP + contract issues | **Reject** |
| User pastes a listing URL / address; we underwrite **for that user** | Lower redistribution surface; still need careful ToS | **Preferred short-term pattern** |
| Link-out to Zillow/Realtor; Papuc stores **user’s** assumptions + pro-forma only | Lowest listing-redistribution risk | **Strong mitigation** |
| Licensed broker + IDX / approved MLS API (e.g. RealEstateAPI MLS after approval) | Proper path to show active MLS listings | **Medium-term goal if we need “real MLS”** |
| Public records / tax / AVM vendors with commercial license | Different product (not live MLS) | Parallel data lane |

**Decision for framing:** Papuc Stage 1 legal posture = **analytical software for investors**, using **third-party and user-provided inputs**, **not** an MLS/IDX site and **not** a brokerage — unless/until we complete a licensed MLS path.

---

## 3. Product framing principles (so docs match the product)

Counsel should draft from these product rules:

1. **Papuc is not a real estate broker, agent, MLS, or IDX portal** (unless we later become one under a brokerage).
2. **Papuc is not an investment adviser, broker-dealer, or crowdfunding portal**; social features are collaboration/tools, not securities offerings (Stage 2 needs a separate securities plan).
3. **Listing cards are informational / illustrative inputs to underwriting**, not an offer to sell property and not a substitute for MLS or the listing broker.
4. **Never claim “official MLS data”** unless the feed is licensed IDX/MLS and display rules are met.
5. Prefer UI language: “Public web listing sources,” “Property records,” “User-imported listing,” “Estimates / models” — not “MLS Search results” for HasData paths.
6. **Photos & agent remarks:** highest copyright risk — minimize, watermark/attribute, link-out, or omit until licensed.
7. **Public projects / share pages:** do not become a wholesale republication of scraped listing databases; gate depth, rate-limit, require attribution, allow takedown.
8. Users remain responsible for verifying numbers with their agent/lender before offers.

Audit current UI for phrases like “MLS” on HasData results (e.g. empty-state copy mentioning MLS) and align with this framing.

---

## 4. Document set to publish on papuc.app

| Doc | Audience | Core job |
|---|---|---|
| **Terms of Service (ToS)** | All users | Contract: account, Pro billing, acceptable use, disclaimers, IP, liability cap, governing law, arbitration (counsel picks venue). |
| **Privacy Policy** | All users + regulators | What we collect (Google OAuth, projects, deals, feed actions, device, cookies), processors (Supabase, Vercel, Anthropic, HasData, RealEstateAPI, email), CCPA/GDPR rights, retention, contact. |
| **Acceptable Use Policy (AUP)** | Users | No scraping our API, no reselling our data dumps, no spam, no illegal offerings, no FCRA-style decisions, no impersonation of brokers. |
| **Data & Listings Disclaimer** (short page or ToS section) | Users | Provenance by source; not MLS/IDX; estimates only; no brokerage relationship. |
| **Social Investing Addendum** (Phase C / Stage 2) | Collab / capital users | Friend collab ≠ co-investment advice; later capital features need securities counsel *before* launch. |
| **Cookie / consent notice** | Web visitors | If analytics / ads require it. |

Footer links on web (and sign-up checkbox): Terms · Privacy · (optional) Data Disclaimer.

**Clickwrap:** On Google sign-in / first session, require acknowledgment: “I agree to Terms and Privacy” with version timestamp stored on `profiles` (`tos_accepted_at`, `tos_version`, `privacy_version`).

---

## 5. Clause checklist for counsel (Papuc-specific)

### 5.1 Terms / User Agreement

- [ ] Description of Service: AI-assisted **pro-forma / scouting software**; not brokerage, not lending, not tax/legal advice.
- [ ] **No dual agency / no client relationship** created by using Papuc.
- [ ] **Investment risk:** past performance / model outputs ≠ results; user may lose money.
- [ ] **Listing data:** third-party sources may be incomplete, stale, or inaccurate; Papuc does not warrant listing status or price.
- [ ] **Source-specific:** disclose that some features use automated retrieval of **publicly available web pages** and/or **licensed property-record APIs**; user acknowledges limits.
- [ ] **Redistribution ban:** users may not bulk-export or republish Papuc’s compiled listing corpus; personal/portfolio use only except as social features explicitly allow.
- [ ] **Public projects:** user warrants they have rights to share what they publish; grant Papuc license to display UGC; takedown process.
- [ ] **Pro / billing** (when Stripe lands): renewals, cancellations, refunds.
- [ ] **Friend collab (Pro):** invitees, roles, owner responsibility for members’ actions.
- [ ] **Indemnity** from users for misuse, illegal syndications, scraped-data abuse.
- [ ] **Limitation of liability** + disclaimers of warranties.
- [ ] **DMCA / IP complaint** contact for listing photos/remarks.
- [ ] **Termination** for AUP violations (including attempts to use Papuc as unlicensed IDX).
- [ ] Governing law / dispute resolution (counsel).

### 5.2 Privacy Policy

- [ ] Categories: account (Google), profile, projects/constraints, deals/scores, condition estimates, follows/watches, share tokens, admin emails, payment metadata (later).
- [ ] **Processors / sub-processors** table: Supabase, Vercel, Anthropic, HasData, RealEstateAPI, AirROI, Resend/email, analytics if any.
- [ ] **What we send to HasData/REA:** search params / URLs — not “we sell your data to Zillow.”
- [ ] No sale of personal info (or CCPA “sale/share” opt-out if ads later).
- [ ] Retention: deals, deleted accounts, backups.
- [ ] Security overview (high level).
- [ ] Children’s privacy (18+ / 21+ — pick with counsel; investing product).
- [ ] International transfers if any.
- [ ] Contact for privacy requests.

### 5.3 Data & Listings Disclaimer (user-facing short form)

Suggested substance (counsel rewrite):

> Papuc is software that helps you model rental investments. Property information may come from third-party services, public web pages, property-record APIs, or information you provide. **Papuc is not a Multiple Listing Service, not an IDX display, and not a real estate brokerage.** Listing details can be wrong or outdated. Always verify with the listing broker, your agent, and primary sources before making an offer. Model outputs (DSCR, cash-on-cash, condition notes) are estimates, not appraisals or lending commitments.

UI: show a compact version on deal cards sourced from `hasdata` / `realestateapi`, and full page in footer.

---

## 6. Compliance roadmap (product + legal workstreams)

### Track L0 — Immediate (before broader marketing)

1. Engage counsel (real estate data + SaaS privacy; later securities for Stage 2).
2. Inventory every listing field we store/display and its source (`hasdata` vs `realestateapi` vs user import).
3. Copy audit: remove or qualify “MLS” claims on non-MLS paths.
4. Publish **draft** Privacy + ToS with clickwrap; iterate with counsel.
5. Add in-app Data Disclaimer + source badge on deals (`Listing source: public web` / `property records` / `imported by you`).

### Track L1 — Risk reduction without a broker license

1. Prefer **user-import / paste URL** + underwrite-for-owner over mass public republication.
2. On **public/share** surfaces: show limited fields; deep data behind auth; strong “verify on source site” CTA (link-out).
3. Avoid bulk CSV of scraped listings for Free users; Pro export = **user’s pro-forma**, not a listing database dump.
4. Ask HasData in writing whether Papuc’s display/storage pattern is permitted under “no republish without permission” — get email on file.
5. Rate-limit scouts; don’t market “nationwide live MLS.”

### Track L2 — If we need real MLS inventory

1. Put a **licensed broker** on the team (or partner brokerage).
2. Apply to **RealEstateAPI Premium MLS** (or per-MLS IDX + RESO) with honest use case: investor underwriting tool under broker control.
3. Implement IDX display rules (brokerage branding, attribution, refresh/takedown).
4. Only then change product copy to “MLS” / “IDX” and update ToS Data section.
5. Until approved, keep HasData path clearly labeled as **non-MLS public-web sourced** — or retire it if counsel says risk is unacceptable.

### Track L3 — Social investing / capital (separate PRD)

1. Friend collab (members, private projects) = software seats, still not a security.
2. Any “invest together / raise / commit capital” → securities counsel (Reg D, crowdfunding portal, broker-dealer, state blue sky) **before** UI ships.
3. Social Investing Addendum + possible entity restructuring.

---

## 7. How this ties to freemium gates

| Feature | Legal note |
|---|---|
| Public projects (Free) | UGC license + user warrant rights; limit scraped listing dump on public feed. |
| Friend collab (Pro) | ToS: owner liable for invites; not a joint venture created by Papuc. |
| Share links | Disclaimer on `/share/[token]`; no login wall for hook OK if content is limited. |
| Export CSV (Pro) | Export underwriting math + user inputs; avoid “entire scraped MLS extract.” |
| Nightly scout | Same data provenance rules; don’t imply exclusive MLS access. |

---

## 8. Explicitly rejected framings

- “HasData means we can use MLS data without a broker license.”
- “It’s public on Zillow so we can rebuild Zillow/IDX inside Papuc.”
- “Disclaimers make scraping + full republication legal.”
- “Social investing ToS can wait until after we take capital.” (Capital features need counsel *first*.)

---

## 9. Implementation checklist (engineering + ops)

- [x] Routes: `/terms`, `/privacy`, `/acceptable-use`, `/data-disclaimer`
- [x] Footer + auth acknowledgment + `profiles.legal_accepted_at` / `legal_version`
- [x] Sign-in checkbox (pre-OAuth) + blocking in-app dialog (post-OAuth / version bump)
- [x] Onboarding runs only after legal acceptance
- [ ] Apply migration `20260831000001_profile_legal_acceptance.sql` in Supabase SQL editor
- [ ] Admin takedown runbook (remove deal/project, ban user)
- [ ] Counsel review sign-off recorded before Pro paid launch / heavy ads
- [ ] Written note from HasData (and RealEstateAPI) on permitted display, if obtainable

---

## 10. Open questions for counsel

1. Is continued HasData→in-app listing display acceptable if we add attribution, link-out, and limit public republication — or should we switch to import/link-out-only until IDX?
2. Governing law / arbitration venue for Papuc entity.
3. Age gate and state-by-state brokerage advertising rules if we later put a broker on the product.
4. Whether public “deal share” pages constitute advertising of listings under state law.
5. CCPA “share” if we add ad pixels.
6. Stage 2: when does “invest together” trigger broker-dealer / investment adviser / portal registration?

---

## 11. One-paragraph brief for the attorney

> Papuc is a SaaS tool that helps rental investors underwrite deals (DSCR/pro-forma). Today we primarily pull candidate listings via HasData’s Zillow listing API (public-page retrieval) and fall back to RealEstateAPI property-record search; we do not yet have broker-licensed IDX/MLS access. We also support public project sharing and plan Pro “scout with friends” collaboration, with capital features later. We need Terms, Privacy, and Acceptable Use that accurately describe data sources, disclaim brokerage and investment advice, restrict redistribution, and do not pretend HasData replaces MLS/IDX licensing. Please advise on short-term display risk mitigations and a medium-term licensed MLS path.

---

## Appendix — Primary sources to attach for counsel

- https://hasdata.com/terms-of-use  
- https://hasdata.com/acceptable-use-policy  
- https://hasdata.com/apis/zillow-api  
- https://www.zillow.com/corporate/terms-of-use/  
- https://developer.realestateapi.com/reference/realestateapi-mls-dataset-and-apis  
- NAR IDX policy overview: https://www.nar.realtor/about-nar/policies/qualification-for-mls-participation-and-idx  
- Internal: `apps/web/lib/scouting.ts` (HasData-first vs RealEstateAPI fallback)
