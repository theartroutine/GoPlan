#!/usr/bin/env bash
#
# Download bundled memory-video music tracks from direct URLs you provide.
#
# This is a convenience installer. It downloads each URL, then immediately
# verifies it is real audio with ffprobe and DELETES bad downloads (e.g. a 404
# HTML page saved as .mp3) so a broken file never gets committed.
#
# HOW TO USE
#   1. Pick tracks from a license-safe CC0/Public Domain source (see README.md).
#   2. Put each track's DIRECT download URL in TRACKS below.
#   3. Run:  cd backend/memories/assets/music && ./download_music.sh
#   4. Run:  ./verify_music.sh
#
# Leave a URL as REPLACE_... to skip it (that track uses the synth fallback).
#
set -uo pipefail
cd "$(dirname "$0")"

# "output-filename|direct-download-url"
TRACKS=(
  "intro-adventure.ogg|REPLACE_WITH_DIRECT_CC0_URL"
  "the-adventure.ogg|REPLACE_WITH_DIRECT_CC0_URL"
  "arcade-adventure.mp3|REPLACE_WITH_DIRECT_CC0_URL"
  "travel-horizon.mp3|REPLACE_WITH_DIRECT_CC0_URL"
  "open-road.mp3|REPLACE_WITH_DIRECT_CC0_URL"
  "victory.mp3|REPLACE_WITH_DIRECT_CC0_URL"
  "traveling-in-your-mind.mp3|REPLACE_WITH_DIRECT_CC0_URL"
)

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found."; exit 1
fi
have_ffprobe=1
command -v ffprobe >/dev/null 2>&1 || have_ffprobe=0

failed=0
for entry in "${TRACKS[@]}"; do
  filename="${entry%%|*}"
  url="${entry##*|}"

  if [[ "$url" == REPLACE_* ]]; then
    echo "skip   $filename (no URL set)"
    continue
  fi

  echo "fetch  $filename"
  if ! curl -fsSL "$url" -o "$filename"; then
    echo "ERROR  download failed: $filename <- $url"
    rm -f "$filename"
    failed=$((failed + 1))
    continue
  fi

  if [[ "$have_ffprobe" -eq 1 ]]; then
    if ! ffprobe -v error -select_streams a:0 -show_entries stream=codec_name \
         -of default=nk=1:nw=1 "$filename" | grep -q .; then
      echo "ERROR  not valid audio (deleting): $filename"
      rm -f "$filename"
      failed=$((failed + 1))
      continue
    fi
  fi
  echo "ok     $filename"
done

echo "-------------------------------------------"
if [[ "$failed" -gt 0 ]]; then
  echo "$failed download(s) failed. Re-check the URLs in this script."
  exit 1
fi
echo "Done. Now run ./verify_music.sh and update CREDITS.md with source provenance."
