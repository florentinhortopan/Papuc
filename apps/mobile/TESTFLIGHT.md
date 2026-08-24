# TestFlight & App Store checklist

## Before first TestFlight

1. [ ] Apple Developer Program membership
2. [ ] Create App Store Connect app (`app.papuc.mobile`)
3. [ ] `cd apps/mobile && npx eas init` → paste project id into `app.json` (`extra.eas.projectId` + `updates.url`)
4. [ ] Fill `eas.json` submit `appleId`, `ascAppId`, `appleTeamId`
5. [ ] Set `EXPO_PUBLIC_API_URL` to a Vercel preview/production URL
6. [ ] Privacy `/privacy` and Support `/support` live on that origin

## Dev Client (daily)

```bash
pnpm --filter @papuc/mobile eas:dev
# install QR on phone, then:
pnpm --filter @papuc/mobile start
```

## TestFlight (soak — required before App Store)

```bash
pnpm --filter @papuc/mobile eas:preview
pnpm --filter @papuc/mobile eas:submit:preview
```

Install via TestFlight. Verify:

- [ ] Cold start / sign-in
- [ ] Home feed scroll + chips
- [ ] Deal peek sheet Save/Skip
- [ ] Talk to Papuc → project create
- [ ] Push permission + tap opens deal
- [ ] Settings toggles
- [ ] Debug footer shows correct API URL

OTA JS-only:

```bash
pnpm --filter @papuc/mobile exec eas update --channel preview --message "ui polish"
```

## App Store (only after you sign off TestFlight)

```bash
pnpm --filter @papuc/mobile eas:prod
eas submit --platform ios --profile production --latest
```

ASC: privacy nutrition labels, push purpose string, screenshots, age rating, export compliance, account deletion path.
