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

## TestFlight

    ios/scripts/testflight.sh

Archives Release (which talks to production), numbers the build 1, 2, 3…
within MARKETING_VERSION by asking App Store Connect for the last one
(`scripts/asc.mjs`; bump MARKETING_VERSION to start a new version at 1), signs for Prompt LLC (team 3AM9B6VP52) and uploads, using the App
Store Connect API key in `~/.appstoreconnect/private_keys/`. Deploy the
server first if the build needs new API routes.

The app icon and the default profile photo are the same face, both made
from `Assets/graduate-avatar-source.png` by `scripts/make-face.swift` (run
instructions at the top of the script).

## UI tests

`BearingsUITests` taps through the app like a person — the navigation
bugs they cover were invisible in screenshots. They run against the local
dev server as a seeded student:

    TOKEN=$(curl -s -D - -o /dev/null -X POST localhost:3000/api/auth/sign-in/email \
      -H 'content-type: application/json' \
      -d '{"email":"maya@example.com","password":"correct-horse-battery"}' \
      | awk -F': ' 'tolower($1)=="set-auth-token"{print $2}' | tr -d '\r')
    TEST_RUNNER_BEARINGS_UITEST_TOKEN=$TOKEN xcodebuild test -project ios/Bearings.xcodeproj \
      -scheme Bearings -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BearingsUITests

Without a token the tests skip rather than fail.

`OnboardingTests` walks a brand-new student from the welcome tour to a
saved profile, so it needs an account with no profile yet. Sign one up
(`POST /api/v1/auth/sign-up`), sign in as above, and pass that token as
`TEST_RUNNER_BEARINGS_UITEST_NEW_TOKEN`. Each run uses the account up.
