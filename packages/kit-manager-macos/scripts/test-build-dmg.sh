#!/bin/bash
set -euo pipefail

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$script_dir/build-dmg.sh" ]] || fail 'the DMG builder is missing'
version=$(plutil -extract version raw -o - "$script_dir/../../../package.json")
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/kit-manager-dmg-test.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

# A stale app version must stop packaging, not just produce a warning.
if bash "$script_dir/build-dmg.sh" 0.0.0 "$tmp_dir/wrong version" > "$tmp_dir/mismatch.log" 2>&1; then
  fail 'a mismatched app version did not stop the build'
fi
grep -F 'does not match kit version 0.0.0' "$tmp_dir/mismatch.log" || {
  tail -n 60 "$tmp_dir/mismatch.log" >&2
  fail 'the mismatch build failed for a reason other than the version check'
}
[[ ! -e "$tmp_dir/wrong version/KitManager.dmg" ]] || fail 'a mismatched app produced a DMG'
if [[ -d "$tmp_dir/wrong version" ]]; then
  [[ -z $(find "$tmp_dir/wrong version" -mindepth 1 -maxdepth 1 -print) ]] || fail 'the mismatch build leaked temporary files'
fi

# The current version must produce one usable image, with no staging files left behind.
if ! bash "$script_dir/build-dmg.sh" "$version" "$tmp_dir/current version" > "$tmp_dir/build.log" 2>&1; then
  tail -n 60 "$tmp_dir/build.log" >&2
  fail 'the current version build failed'
fi
image="$tmp_dir/current version/KitManager.dmg"
[[ -s "$image" ]] || fail 'the current version build did not produce a DMG'
hdiutil verify "$image"
[[ -z $(find "$tmp_dir/current version" -mindepth 1 -maxdepth 1 ! -name KitManager.dmg -print) ]] || fail 'the build leaked temporary files'
printf 'Kit Manager DMG tests passed\n'
