#!/usr/bin/env bash
#
# One-command iOS release build for TestFlight / App Store.
#
# What today's ordeal bought us: a clean keychain, a Distribution certificate
# whose private key lives in the login keychain, the WWDR intermediate, the
# codesign partition list, an ASCII PRODUCT_NAME (the Turkish ğ was breaking
# the code seal), UIRequiresFullScreen, and production APNs entitlements. All
# of that is permanent. This script is the 5-minute path that remains:
#
#   1. rebuilds the web app and copies it into the native project
#   2. bumps the build number (App Store rejects a build number it has seen)
#   3. archives, signs and exports a distribution-signed .ipa
#   4. verifies the signature + seal, and drops the .ipa on the Desktop
#
# You then drag that one file into Transporter. That is the whole update flow.
#
# Usage:
#   npm run release            # auto-increments the build number
#   MARKETING_VERSION=3.1 npm run release   # also set the user-visible version
#
set -euo pipefail

# CocoaPods' build scripts choke on an empty locale, and the app is named with
# a non-ASCII character — force a UTF-8 locale so nothing downstream trips.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKSPACE="ios/App/App.xcworkspace"
SCHEME="App"
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
EXPORT_OPTIONS="ios/ExportOptions.plist"
ARCHIVE="/tmp/RahmanEgitim-release.xcarchive"
EXPORT_DIR="/tmp/RahmanEgitim-export"
DESKTOP="$HOME/Desktop"

say() { printf "\n\033[1;32m==> %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31mFAILED: %s\033[0m\n" "$1" >&2; exit 1; }

# --- 1. Bump the build number (CURRENT_PROJECT_VERSION) ---------------------
# App Store Connect refuses a build number it has already seen, so every upload
# must carry a higher one. We read the current value and add 1, writing it to
# both build configurations.
CURRENT_BUILD="$(grep -m1 -E 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | grep -oE '[0-9]+')"
[ -n "$CURRENT_BUILD" ] || die "could not read CURRENT_PROJECT_VERSION from the Xcode project"
NEXT_BUILD=$((CURRENT_BUILD + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = ${CURRENT_BUILD};/CURRENT_PROJECT_VERSION = ${NEXT_BUILD};/g" "$PBXPROJ"
say "Build number: ${CURRENT_BUILD} -> ${NEXT_BUILD}"

# Optional user-visible version bump (the "3.0" App Store shows), only when asked.
if [ -n "${MARKETING_VERSION:-}" ]; then
  sed -i '' "s/MARKETING_VERSION = [0-9][0-9.]*;/MARKETING_VERSION = ${MARKETING_VERSION};/g" "$PBXPROJ"
  say "Marketing version set to ${MARKETING_VERSION}"
fi

# --- 2. Build the web app and sync it into the native project ---------------
say "Building web app (npm run build)"
npm run build >/tmp/release-web.log 2>&1 || { cat /tmp/release-web.log; die "web build failed"; }

say "Syncing into iOS (cap sync)"
npx cap sync ios >/tmp/release-sync.log 2>&1 || { cat /tmp/release-sync.log; die "cap sync failed"; }

# --- 3. Archive + export a distribution-signed .ipa -------------------------
say "Archiving (this is the slow step, ~2-3 min)"
rm -rf "$ARCHIVE" "$EXPORT_DIR"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  clean archive -allowProvisioningUpdates >/tmp/release-archive.log 2>&1 \
  || { tail -30 /tmp/release-archive.log; die "archive failed"; }

say "Exporting signed .ipa"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" -allowProvisioningUpdates \
  >/tmp/release-export.log 2>&1 \
  || { tail -30 /tmp/release-export.log; die "export failed"; }

IPA="$(ls "$EXPORT_DIR"/*.ipa 2>/dev/null | head -1)"
[ -n "$IPA" ] || die "no .ipa was produced"

# --- 4. Verify before handing it over --------------------------------------
# These are exactly the two things that bit us today: the signing authority
# (must be Apple Distribution, not Development) and the code seal (the ğ in the
# executable name silently broke it). Fail loudly here rather than at Apple.
say "Verifying signature and seal"
VERIFY_DIR="/tmp/RahmanEgitim-verify"
rm -rf "$VERIFY_DIR"; mkdir -p "$VERIFY_DIR"
ditto -x -k "$IPA" "$VERIFY_DIR" 2>/dev/null
APP="$(ls -d "$VERIFY_DIR"/Payload/*.app)"
AUTH="$(codesign -dvv "$APP" 2>&1 | grep -oE 'Authority=Apple Distribution[^)]*\)' | head -1 || true)"
[ -n "$AUTH" ] || die "the app is NOT signed with Apple Distribution — do not upload"
codesign --verify --deep --strict "$APP" 2>/dev/null || die "code seal is invalid — do not upload"

# --- 5. Deliver to the Desktop ---------------------------------------------
STAMP="$(date +%Y%m%d-%H%M)"
OUT="$DESKTOP/RahmanEgitim-b${NEXT_BUILD}-${STAMP}.ipa"
cp "$IPA" "$OUT"

printf "\n\033[1;32m========================================\033[0m\n"
printf "\033[1;32m  READY TO UPLOAD\033[0m\n"
printf "  Build number : %s\n" "$NEXT_BUILD"
printf "  Signed with  : %s\n" "${AUTH#Authority=}"
printf "  Seal         : valid\n"
printf "  File         : %s\n" "$OUT"
printf "\033[1;32m========================================\033[0m\n"
printf "\nNext (the only manual step):\n"
printf "  1. Open Transporter\n"
printf "  2. Drag the .ipa above into it\n"
printf "  3. Deliver\n"
printf "  4. App Store Connect -> TestFlight: the new build appears after processing\n\n"
