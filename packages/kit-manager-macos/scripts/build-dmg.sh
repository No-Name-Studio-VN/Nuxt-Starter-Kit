#!/bin/bash
set -euo pipefail

fail() {
  printf 'Kit Manager DMG: %s\n' "$*" >&2
  exit 1
}

[[ $# -eq 2 && -n "$1" && -n "$2" ]] || fail 'usage: build-dmg.sh <kit-version> <output-directory>'
kit_version=$1

[[ $(uname -s) == Darwin ]] || fail 'macOS with Xcode 27 or later is required'
xcode_version=$(xcodebuild -version) || fail 'select a full Xcode 27 or later installation'
if [[ ! "$xcode_version" =~ ^Xcode\ ([0-9]+) || ${BASH_REMATCH[1]} -lt 27 ]]; then
  fail "Xcode 27 or later is required; found ${xcode_version%%$'\n'*}"
fi
printf '%s\n' "$xcode_version"

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p -- "$2"
output_dir=$(cd -- "$2" && pwd)
output_image="$output_dir/KitManager.dmg"
[[ ! -d "$output_image" ]] || fail "$output_image is a directory"

# Keep the verified image on the output filesystem for an atomic final move.
work_dir=$(mktemp -d "$output_dir/.kit-manager-dmg.XXXXXX")
mount_dir="$work_dir/mount"

is_mounted() {
  [[ -d "$mount_dir" && $(stat -f '%d' "$mount_dir") != $(stat -f '%d' "$work_dir") ]]
}

cleanup() {
  local status=$?
  trap - EXIT
  if is_mounted; then
    hdiutil detach "$mount_dir" || hdiutil detach -force "$mount_dir" ||
      fail "could not detach $mount_dir; leaving it untouched"
  fi
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

xcodebuild -project "$project_dir/KitManager.xcodeproj" -scheme KitManager \
  -configuration Release -destination 'generic/platform=macOS' \
  -derivedDataPath "$work_dir/build" \
  ARCHS='arm64 x86_64' ONLY_ACTIVE_ARCH=NO MACOSX_DEPLOYMENT_TARGET=26.0 \
  CODE_SIGNING_ALLOWED=NO build

verify_bundle() {
  local app=$1 plist="$1/Contents/Info.plist" app_version executable archs
  app_version=$(plutil -extract CFBundleShortVersionString raw -o - "$plist")
  [[ "$app_version" == "$kit_version" ]] || fail "app version $app_version does not match kit version $kit_version"
  executable=$(plutil -extract CFBundleExecutable raw -o - "$plist")
  archs=$(xcrun lipo -archs "$app/Contents/MacOS/$executable")
  [[ "$archs" == 'arm64 x86_64' || "$archs" == 'x86_64 arm64' ]] || fail "expected arm64 and x86_64 slices, found $archs"
  printf 'Verified Kit Manager %s (%s)\n' "$app_version" "$archs"
}

app="$work_dir/build/Build/Products/Release/KitManager.app"
verify_bundle "$app"
codesign --force --sign - "$app"
codesign --verify --deep --strict --all-architectures --verbose=2 "$app"

stage_dir="$work_dir/stage"
mkdir -- "$stage_dir" "$mount_dir"
ditto "$app" "$stage_dir/KitManager.app"
ln -s /Applications "$stage_dir/Applications"

image="$work_dir/KitManager.dmg"
hdiutil create -srcfolder "$stage_dir" -volname 'Kit Manager' -fs HFS+ -format UDZO "$image"
hdiutil verify "$image"
hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$image"
is_mounted || fail 'the disk image did not mount'
verify_bundle "$mount_dir/KitManager.app"
codesign --verify --deep --strict --all-architectures --verbose=2 "$mount_dir/KitManager.app"
[[ -L "$mount_dir/Applications" && $(readlink "$mount_dir/Applications") == /Applications ]] || fail 'Applications shortcut is missing or invalid'
hdiutil detach "$mount_dir"

mv -fh -- "$image" "$output_image"
printf 'Created %s\n' "$output_image"
