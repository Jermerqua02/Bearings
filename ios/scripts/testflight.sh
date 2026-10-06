#!/bin/sh
# Archive a Release build and upload it to TestFlight.
#
#   ASC_ISSUER_ID=<issuer id> ios/scripts/testflight.sh
#
# Release builds talk to production, so deploy the server first if this
# build depends on API changes (see the railway-* notes: `railway up`, then
# wait for SUCCESS in `railway deployment list`).
#
# Signs and uploads with the App Store Connect API key rather than the
# Apple ID saved in Xcode, so it works from a terminal with no Xcode login.
set -eu

KEY_ID="${ASC_KEY_ID:-HU8FQ57PS3}"
ISSUER_ID="${ASC_ISSUER_ID:?Set ASC_ISSUER_ID — App Store Connect → Users and Access → Integrations}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
# Every upload needs a build number App Store Connect hasn't seen; a
# timestamp is always larger than the last one without tracking state.
BUILD="$(date +%Y%m%d%H%M)"

AUTH="-allowProvisioningUpdates \
  -authenticationKeyPath $KEY_PATH \
  -authenticationKeyID $KEY_ID \
  -authenticationKeyIssuerID $ISSUER_ID"

echo "→ Archiving build $BUILD"
# shellcheck disable=SC2086
xcodebuild -project "$HERE/Bearings.xcodeproj" -scheme Bearings -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Bearings.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD" $AUTH -quiet archive

echo "→ Uploading to App Store Connect"
# shellcheck disable=SC2086
xcodebuild -exportArchive -archivePath "$OUT/Bearings.xcarchive" \
  -exportOptionsPlist "$HERE/scripts/ExportOptions.plist" -exportPath "$OUT/export" $AUTH

echo "✓ Uploaded build $BUILD. It appears in TestFlight after processing (usually 5–15 min)."
