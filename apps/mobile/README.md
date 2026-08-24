# Papuc Mobile (Expo) — iOS first

Airbnb-like, Voice-first discovery app. Stitch designs live in project
`Papuc iOS` (`projects/3060932858356978304`). See [`DESIGN.md`](./DESIGN.md).

## Setup

1. Copy env:
   ```bash
   cp .env.example .env
   ```
   Set `EXPO_PUBLIC_SUPABASE_*` (same project as web) and
   `EXPO_PUBLIC_API_URL` to your Vercel origin (preview or production), e.g.
   `https://papuc.vercel.app`.

2. Install deps from monorepo root:
   ```bash
   pnpm install
   pnpm --filter @papuc/mobile start
   ```

3. Replace `REPLACE_WITH_EAS_PROJECT_ID` in `app.json` after `eas init`.
   Fill Apple IDs in `eas.json` submit profiles.

## Debug / redesign loop

| Layer | Command | Use when |
|-------|---------|----------|
| Dev Client | `pnpm eas:dev` then Metro `start` | Daily UI / Stitch iteration |
| OTA | `pnpm eas:update:preview -- "copy"` | JS-only polish on TestFlight binary |
| TestFlight | `pnpm eas:preview` → `pnpm eas:submit:preview` | Push, Voice shell, soak |
| App Store | `pnpm eas:prod` + submit production | **Only after TestFlight sign-off** |

Debug footer (dev/preview) shows API URL, channel, build, last error.

## APIs

Mobile calls Vercel `/api/*` with `Authorization: Bearer <supabase access token>`
(not Supabase Edge Functions).
