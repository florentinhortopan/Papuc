# Papuc Mobile (Expo) — PARKED

This Expo app was the original target for Papuc. It has been **parked** in
favor of the web-first MVP at `apps/web/` (deployed on Vercel) for these
reasons:

- The web app needs no Docker, no Xcode, and no local Supabase stack.
- Vercel deploys the Next.js app + API routes + cron in a single push.
- All shared business logic lives in `packages/core/` and is reused by the
  web app, so when we revisit native distribution we don't have to redo it.

The screens, components, and lib in this folder are intact. To revive the
mobile target later:

1. Update SDK + dependencies:
   ```bash
   pnpm --filter @papuc/mobile install
   pnpm --filter @papuc/mobile expo install --fix
   ```
2. Replace `src/lib/supabase.ts` calls to old Edge Functions
   (`supabase.functions.invoke("scout-project", ...)`) with calls to the new
   `apps/web/app/api/*` routes. The Next API routes accept the same JSON
   bodies and return the same shapes.
3. Keep `apps/mobile/.env` pointing at the same Supabase project as
   `apps/web/.env.local`. Auth tokens issued by Supabase work for both
   clients.
4. Re-enable EAS build / submit once you're ready to ship to App Store / Play.

Until then, the web app is the production target. You can still run this app
locally with the original `pnpm --filter @papuc/mobile start`, but the API
calls inside it will need to be re-pointed at `https://<your-vercel>/api/*`
first or they'll fail (the Supabase Edge Functions are no longer deployed).
