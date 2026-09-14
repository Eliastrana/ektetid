# EkteTid

Share real moments with real friends. Take a photo (with a selfie of your reaction), put it in an album, and only friends you've accepted can see it. Posts show up in a feed, in a vertical stream and on a map.

Available on the [App Store](https://apps.apple.com/no/app/ektetid/id6794649649). Android is a sideloaded APK, and there is a web build (PWA).

## Stack

- **App:** Expo 57 (React Native 0.86, Expo Router, NativeWind v5)
- **Backend:** Supabase (Postgres with row-level security, Storage, Edge Functions)
- **Payments:** a one-time Pro purchase through `expo-iap`, verified server-side (iOS only)
- **Native modules:** `modules/` (MapKit venue search, volume-button shutter) and iOS widgets in `targets/`

## Getting started

```bash
npm install
cp .env.example .env   # add your Supabase URL and anon key
npm start
```

| Command | What it does |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run ios` | Build and run on iOS |
| `npm run android` | Build and run on Android |
| `npm run web` | Run in the browser |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run test:db` | Run `supabase/tests/*.sql` against a local Supabase (`supabase start`) |

**iOS on this Mac:** CocoaPods needs a UTF-8 locale, so run iOS builds as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run ios`. Install on a plugged-in iPhone with `npx expo run:ios --device --configuration Release`.

## Project layout

```
src/app/          screens (file-based routes)
src/components/   UI components (.ios / .android / .web variants where platforms differ)
src/lib/          data access and logic (Supabase queries, publishing, notifications, map)
supabase/         migrations, Edge Functions (notify, verify-pro-purchase, delete-account), SQL tests
modules/          local native modules
targets/          iOS widget targets
patches/          patch-package fixes, applied on install
```

## Backend

Schema changes go in a new numbered file in `supabase/migrations/`. Never edit a migration that has already been applied.

```bash
supabase db push                          # apply new migrations
supabase functions deploy notify          # after changing an Edge Function
```

If `db push` tries to re-apply a migration that already exists remotely (for example, one run by hand in the SQL editor), mark it as applied instead: `supabase migration repair --status applied <version>`.

## Releasing (iOS)

1. Bump `version` in `app.json`. Apple rejects new builds under a version that is already live; EAS increments the build number on its own.
2. Build and send to TestFlight:
   ```bash
   npx eas-cli build --platform ios --profile production --auto-submit
   ```
3. Write the release notes in Norwegian. The app shows them word for word in its "Ny versjon" card.

## Gotchas

- The `lightningcss` override in `package.json` is load-bearing; bumping it breaks CSS bundling.
- NativeWind ignores `className` on `SafeAreaView`; use the `Screen` component instead.
