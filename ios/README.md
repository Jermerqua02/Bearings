# Bearings for iOS

Native SwiftUI. Talks to the same server as the website through `/api/v1`
(see `lib/api/v1.ts`), which wraps the same server actions the site calls —
one implementation of every rule, two clients.

## Run it

1. `npm run db:up && npm run dev` in the repo root.
2. Open `ios/Bearings.xcodeproj`, pick an iPhone simulator, Run.

Debug builds talk to `http://localhost:3000`; Release builds to production.
Both come from `BEARINGS_API_BASE_URL` in the target's build settings.
The seeded student is `maya@example.com` / `correct-horse-battery`.

For a real device, set your team under Signing & Capabilities, and point
Debug at your Mac's LAN address (localhost on the phone is the phone).

## Layout

- `App/` — entry point, `AppModel` (the native profile-context)
- `Core/` — API client, Keychain, config
- `Models/` — Codable mirrors of `lib/types.ts`, ports of `lib/match.ts`
- `Design/` — tokens from `app/globals.css`, shared components
- `Features/` — one folder per tab

The project uses a synchronized folder: any file added under `Bearings/`
is in the build. There is no file list to maintain.

## Auth

Better Auth's bearer plugin. Sign-in returns `set-auth-token`; the app
stores it in the Keychain and sends `Authorization: Bearer`. Cookies are off
in the URLSession on purpose — a cookie would trigger Better Auth's origin
check, which a native request can't pass.
