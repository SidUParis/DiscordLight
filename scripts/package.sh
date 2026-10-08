#!/usr/bin/env bash
# Builds DiscordLight.app and packages it for a GitHub Release. Used by .github/workflows/release.yml; runs locally too.
#
#   scripts/package.sh [tag]        e.g. scripts/package.sh v1.2.0
#
# Without a tag, the version comes from src/Info.plist (CFBundleShortVersionString), prefixed with "v".
# Output in the repo root (all gitignored): DiscordLight-<tag>-macOS.zip, DiscordLight-<tag>-macOS.dmg, SHA256SUMS.txt.
# The DMG is built from dist/ (the app plus an Applications symlink).
#
# Environment:
#   ARCHS   architectures of the binary, default "arm64 x86_64" (universal: the GitHub runner is Apple Silicon, and
#           Intel Macs must run the release too). ARCHS= (empty) builds for this Mac only, exactly like `make build`.
#
# The compile line itself stays in the Makefile: for a universal build, `make build` runs with a `clang` wrapper first
# on PATH that adds the -arch flags. MACOSX_DEPLOYMENT_TARGET is set from LSMinimumSystemVersion in Info.plist, so
# the binary runs on the oldest macOS the bundle claims (without it, clang targets the build machine's macOS).
#
# Needs macOS with the Xcode Command Line Tools (clang, codesign, ditto, hdiutil, lipo, shasum, PlistBuddy).
# The app is ad-hoc signed, not notarized: see "Install" in README.md.
set -euo pipefail

cd "$(dirname "$0")/.."

APP="DiscordLight.app"
BIN="$APP/Contents/MacOS/DiscordLight"
PLIST="src/Info.plist"
PLISTBUDDY="/usr/libexec/PlistBuddy"

die() { echo "package.sh: $*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "needs macOS (codesign, hdiutil)"
[[ -x "$PLISTBUDDY" ]] || die "$PLISTBUDDY not found"

VERSION="$("$PLISTBUDDY" -c "Print :CFBundleShortVersionString" "$PLIST")"
MIN_OS="$("$PLISTBUDDY" -c "Print :LSMinimumSystemVersion" "$PLIST")"
TAG="${1:-v$VERSION}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "tag '$TAG' may only contain letters, digits, '.', '_' and '-'"
if [[ "$TAG" != "v$VERSION" ]]; then
  # Shown as an annotation on GitHub Actions, as a plain line locally
  echo "::warning::tag $TAG does not match $PLIST version $VERSION (v$VERSION)"
fi

ZIP="DiscordLight-$TAG-macOS.zip"
DMG="DiscordLight-$TAG-macOS.dmg"
SUMS="SHA256SUMS.txt"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------- build ----------
export MACOSX_DEPLOYMENT_TARGET="$MIN_OS"
ARCHS="${ARCHS-arm64 x86_64}"
echo "==> Building $APP $TAG (archs: ${ARCHS:-host}, macOS >= $MIN_OS)"
if [[ -n "$ARCHS" ]]; then
  REAL_CLANG="$(xcrun -f clang)"
  ARCH_FLAGS=""
  for a in $ARCHS; do ARCH_FLAGS+=" -arch $a"; done
  mkdir -p "$WORK/bin"
  printf '#!/bin/sh\nexec "%s"%s "$@"\n' "$REAL_CLANG" "$ARCH_FLAGS" > "$WORK/bin/clang"
  chmod +x "$WORK/bin/clang"
  PATH="$WORK/bin:$PATH" make clean build
else
  make clean build
fi

[[ -x "$BIN" ]] || die "build produced no $BIN"
echo "==> Binary architectures: $(lipo -archs "$BIN")"
for a in $ARCHS; do
  lipo "$BIN" -verify_arch "$a" || die "binary has no $a slice"
done

# ---------- sign (ad-hoc; must come after every change to the bundle) ----------
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

# ---------- zip ----------
rm -rf dist "$ZIP" "$DMG" "$SUMS"
ditto -c -k --keepParent "$APP" "$ZIP"

# ---------- dmg: the app next to an Applications symlink ----------
mkdir dist
ditto "$APP" "dist/$APP"
ln -s /Applications dist/Applications
# hdiutil on CI runners sometimes fails with "Resource busy"; retry a few times
for attempt in 1 2 3; do
  if hdiutil create -volname DiscordLight -srcfolder dist -ov -format UDZO "$DMG"; then
    break
  fi
  [[ $attempt -lt 3 ]] || die "hdiutil create failed"
  echo "hdiutil create failed (attempt $attempt), retrying in 5 s"
  sleep 5
done

# ---------- checksums ----------
shasum -a 256 "$ZIP" "$DMG" > "$SUMS"
cat "$SUMS"

# File names for the release step
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "zip=$ZIP"
    echo "dmg=$DMG"
    echo "sums=$SUMS"
  } >> "$GITHUB_OUTPUT"
fi

echo "==> Done: $ZIP, $DMG, $SUMS"
