# Papuc — DSCR Deal Scout

Web-first real-estate-investing copilot. Describe a rental investment goal in plain English; an agent translates it into search constraints, scouts MLS listings via [RealEstateAPI.com](https://realestateapi.com), and ranks deals by **DSCR** + **cash-on-cash** using a pro-forma model ported from `Berkeley.xlsx`.

## Stack (MVP)

- **Web app**: Next.js 15 + App Router + TypeScript + Tailwind + shadcn-style components, deployed on Vercel
- **Database / Auth / Realtime**: Supabase Cloud (no Docker, no local stack)
- **Auth**: Google OAuth via Supabase Auth
- **Background jobs**: Vercel Cron (nightly), no `pg_cron` needed
- **Data**: RealEstateAPI.com (MLS Search, Property Detail, Comparables)
- **Agent**: Claude (`@anthropic-ai/sdk`) behind an abstracted `LLMProvider`

## Layout

```
apps/web/                   Next.js web app (primary, deployed on Vercel)
  app/sign-in/              Google sign-in
  app/auth/callback/        OAuth code exchange
  app/(app)/projects/       List + new + detail (with realtime deal feed)
  app/(app)/deals/[id]/     Editable pro-forma + cashflow chart + comps + CSV export
  app/(app)/portfolio/      Saved deals + side-by-side compare
  app/(app)/lenders/        DSCR lender directory
  app/(app)/settings/       Profile + Pro tier placeholder
  app/api/projects/parse/   Claude tool-call: prompt -> ProjectConstraints
  app/api/projects/[id]/scout/   MLS search -> hydrate -> score -> persist
  app/api/deals/rank/            Claude rationales for scored deals
  app/api/deals/[id]/comparables/ RealEstateAPI PropertyComps
  app/api/cron/nightly-scout/    Vercel Cron entry, scouts every active project
  components/ui/            Button, Card, Input, Label, Badge, Dialog, Field
  components/               DealCard, DscrBadge, PhotoCarousel (embla),
                            CashflowChart (recharts), StrMatrix, ComparablesPanel,
                            OnboardingDialog, UpgradeDialog, app shell
  lib/supabase/             server / client / admin / middleware
  lib/                      projects, deals, profile, comparables, format,
                            export (browser CSV), lenders, scouting (server),
                            database.types
  vercel.json               Vercel Cron schedule
apps/mobile/                Expo app — PARKED for now (kept on disk, not the
                            primary target). See apps/mobile/README.md.
packages/core/              Pure TS, isomorphic
  src/proforma.ts           12-month pro-forma engine (port of Berkeley.xlsx)
  src/dscr.ts               PITIA + DSCR + monthly P&I
  src/realestate.ts         RealEstateAPIClient (search/detail/comps/autocomplete)
  src/llm/                  LLMProvider + ClaudeProvider + MockLLMProvider + prompts
  src/schemas.ts            Zod schemas (ProjectConstraints, ProForma, ...)
  src/__tests__/            Vitest parity tests vs Berkeley.xlsx
supabase/
  migrations/               SQL schema, RLS, storage, push_and_cron, subs
                            (apply via the Supabase SQL editor; CLI not required)
  functions/                Reference Deno Edge Functions (no longer deployed
                            in the web MVP — replaced by app/api/* routes)
Berkeley.xlsx               Source-of-truth pro-forma model
```

## Local dev (no Docker, no Deno, no Xcode)

1. **Create a free Supabase project** at [supabase.com](https://supabase.com).
2. **Apply migrations** via the dashboard SQL editor: open each file in
   `supabase/migrations/` (in order) and run it. You can **skip**
   `20260430000004_push_and_cron.sql` — it's not needed for the web MVP.
3. **Enable Google OAuth** in the Supabase dashboard:
   - Auth → Providers → Google → Enable
   - Create an OAuth 2.0 Web client in Google Cloud Console
     ([console.cloud.google.com](https://console.cloud.google.com))
     - Authorized redirect URI:
       `https://<your-project>.supabase.co/auth/v1/callback`
   - Paste the Google client id + secret into the Supabase provider config.
4. **Auth → URL Configuration → Redirect URLs**: add
   `http://localhost:3000/auth/callback` (and your Vercel URL once deployed).
5. **Copy env vars**:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```
   Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project API
     Settings)
   - `SUPABASE_SERVICE_ROLE_KEY` (same page; **server-only**, never commit)
   - `REALESTATEAPI_KEY`
   - `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`)
   - `CRON_SECRET` (any random string, e.g. `openssl rand -hex 32`)
   - `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
6. **Install + dev**:
   ```bash
   pnpm install
   pnpm dev
   ```
   Open `http://localhost:3000`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel → New Project, import the repo. Set the **Root Directory** to
   `apps/web`. Vercel auto-detects Next.js.
3. Paste the same env vars from `.env.example` into Project → Settings →
   Environment Variables. Set `NEXT_PUBLIC_SITE_URL` to your Vercel domain
   (e.g. `https://papuc.vercel.app`).
4. Deploy. Vercel reads `apps/web/vercel.json` and registers the nightly-scout
   cron automatically.
5. Add the production + preview URLs to Supabase Auth → URL Configuration →
   Redirect URLs.

That's it — no Docker, no Supabase CLI, no `supabase functions deploy`.

## Test the pro-forma engine

```bash
pnpm test
```

Snapshot tests assert parity with `Berkeley.xlsx` for `Template`, `2701 Grant`,
`2319 Ward`, and `2717 Mabel`.

## Agent pipeline

```
User prompt
  -> /api/projects/parse (Claude tool-call -> ProjectConstraints)
  -> projects.constraints (Postgres)
  -> [user clicks Scout | Vercel Cron nightly]
  -> /api/projects/:id/scout
       -> RealEstateAPI MLS Search (filters)
       -> Property Detail per top-N (rent + AVM + photos)
       -> packages/core proforma + DSCR scoring
       -> deals + deal_scores
  -> /api/deals/rank (Claude rationale + final score)
  -> Realtime stream into Project Detail
  -> User saves / dismisses / shares / exports CSV
```

## DSCR + pro-forma model

Implemented in `packages/core/src/proforma.ts`:

- `computePITIA(...)` — standard amortization for P&I; defaults: tax 1.1%/yr, PMI 1%/yr if LTV > 80%, $100/mo insurance.
- `computeDSCR({ monthlyRent, pitiaTotal, rentHaircutPct? })` — `Rent / PITIA`, with optional 75% lender haircut.
- `computeProForma(...)` — 12-month grid + annual pre/after-tax + Cash-on-Cash + Payout years + 5-Yr IRR + 5-Yr Equity Multiple. Supports both LTR and STR modes (mirrors Berkeley rows 30-55).

## Mobile app

`apps/mobile/` (Expo) is parked. The web MVP covers all the same flows. When
you're ready to ship native, the Expo screens are intact — just refresh the
deps and re-link the same Supabase project. See `apps/mobile/README.md`.

## Disclaimer

DSCR figures shown in the app are **investor underwriting estimates**, not
lender quotes. Lenders may apply 75% rent factor, vacancy adjustments, and
other haircuts. Always verify with a real DSCR lender before making an offer.
