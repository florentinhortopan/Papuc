# Supabase Edge Functions — REFERENCE ONLY

These Deno-based Edge Functions were the original backend for Papuc. The web
MVP at `apps/web/` now serves the same logic via Next.js API routes
(`apps/web/app/api/*`), which import directly from `@papuc/core` instead of
maintaining a Deno duplicate.

The function folders are kept here for reference / future use (e.g. if you
ever want to run the agent loop entirely inside Supabase). They will **not**
compile as-is anymore because the duplicated `_shared/{anthropic,prompts,types,dscr,proforma,realestate,expoPush}.ts`
files have been deleted in favor of the single `@papuc/core` source.

If you decide to re-deploy these:

1. Re-port `_shared/anthropic.ts` etc. (or import from `@papuc/core` via the
   `npm:` prefix supported by recent Deno + Supabase Edge Runtime versions).
2. Run `supabase functions deploy parse-project-goals scout-project rank-deals comparables nightly-scout`.
3. Set `ANTHROPIC_API_KEY`, `REALESTATEAPI_KEY` via `supabase secrets set`.

For day-to-day MVP usage you do **not** need any of this — just deploy the
Next.js app to Vercel.

## Mapping (old → new)

| Old Edge Function | New Next API route                              |
| ----------------- | ----------------------------------------------- |
| parse-project-goals | `app/api/projects/parse/route.ts`            |
| scout-project       | `app/api/projects/[id]/scout/route.ts`       |
| rank-deals          | `app/api/deals/rank/route.ts`                |
| comparables         | `app/api/deals/[id]/comparables/route.ts`    |
| nightly-scout       | `app/api/cron/nightly-scout/route.ts` (Vercel Cron) |
