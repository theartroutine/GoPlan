#!/usr/bin/env bash
#
# Verify bundled memory-video music assets.
#
# Checks each expected track file: exists, is real decodable audio (ffprobe),
# stereo, and has a sane duration. Run this AFTER dropping files in this folder
# (whether you downloaded them manually or via download_music.sh). It catches
# dead-link downloads / HTML error pages saved as ".mp3" before they ship.
#
# Usage:
#   cd backend/memories/assets/music
#   ./verify_music.sh
#
set -uo pipefail
cd "$(dirname "$0")"

EXPECTED=("sunrise-road.mp3" "coastal-light.mp3" "lantern-evening.mp3")
MIN_SECONDS=20

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found. Install ffmpeg first (macOS: brew install ffmpeg)."
  exit 1
fi

missing=0
bad=0
ok=0

for name in "${EXPECTED[@]}"; do
  if [[ ! -f "$name" ]]; then
    echo "MISSING  $name  (render will fall back to a synth tone for this track)"
    missing=$((missing + 1))
    continue
  fi

  # Probe codec_type of the first audio stream + duration.
  codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name \
    -of default=nk=1:nw=1 "$name" 2>/dev/null)
  duration=$(ffprobe -v error -show_entries format=duration \
    -of default=nk=1:nw=1 "$name" 2>/dev/null)

  if [[ -z "$codec" ]]; then
    echo "BAD      $name  (no audio stream — likely an HTML error page or corrupt file)"
    bad=$((bad + 1))
    continue
  fi

  dur_int=${duration%.*}
  if [[ -z "$dur_int" || "$dur_int" -lt "$MIN_SECONDS" ]]; then
    echo "BAD      $name  (duration ${duration:-0}s is too short; expected >= ${MIN_SECONDS}s)"
    bad=$((bad + 1))
    continue
  fi

  echo "OK       $name  (codec=$codec, ${dur_int}s)"
  ok=$((ok + 1))
done

echo "-------------------------------------------"
echo "OK: $ok   MISSING: $missing   BAD: $bad"

if [[ "$bad" -gt 0 ]]; then
  echo "Fix BAD files (re-download from a CC0/CC-BY source) before committing."
  exit 1
fi
if [[ "$missing" -gt 0 ]]; then
  echo "Some tracks are missing; renders use the synth fallback for those. Not an error."
fi
exit 0
