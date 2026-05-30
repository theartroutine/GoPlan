#!/usr/bin/env bash
#
# One-command installer for CC BY 4.0 music by Kevin MacLeod (incompetech.com),
# pulled from the stable Internet Archive mirror of his catalog.
#
# It resolves three calm/cinematic tracks from the LIVE archive.org file list,
# downloads them as sunrise-road.mp3 / coastal-light.mp3 / lantern-evening.mp3,
# validates each with ffprobe, and DELETES anything that is not real audio.
#
# ⚠️  LICENSE: these tracks are CC BY 4.0 — attribution is MANDATORY and must be
#     shown to end users (not just kept in CREDITS.md). After running this, fill
#     CREDITS.md and make sure the memory/share page shows the credit.
#     If you want NO attribution burden, use Route A (CC0) in README.md instead.
#
# Usage:  cd backend/memories/assets/music && ./download_incompetech.sh
# Then:   ./verify_music.sh   and update CREDITS.md
#
set -uo pipefail
cd "$(dirname "$0")"

for bin in curl python3 ffprobe; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing: $bin"; exit 1; }
done

echo "Fetching catalog from Internet Archive ..."
curl -fsSL "https://archive.org/metadata/Incompetech" -o /tmp/incompetech_meta.json \
  || { echo "Could not reach archive.org"; exit 1; }

python3 - <<'PY'
import json, os, subprocess, urllib.parse, sys

meta = json.load(open("/tmp/incompetech_meta.json"))
files = [f["name"] for f in meta.get("files", [])
         if f.get("name", "").lower().endswith(".mp3")]

# Build the real download base from the metadata (the generic
# archive.org/download/<id>/ path returns 500 for this item, so use the
# data node + dir that the metadata API reports).
node = meta.get("d1") or meta.get("server")
ddir = meta.get("dir", "")
if not node or not ddir:
    print("Metadata missing data-node/dir fields; cannot build URLs.")
    sys.exit(1)
base = f"https://{node}{ddir}/"

# Preference order: calm / gentle / cinematic tracks known to exist in this
# mirror, smaller files first (avoids 30-min, 70 MB+ tracks bloating the repo).
wants = ["air prelude", "at rest", "bathed in the light", "atlantean twilight",
         "ashton manor", "ascending the vale", "arcadia", "autumn day",
         "avec soin", "awaiting return", "aretes", "calm", "serene", "gentle",
         "ambient", "peaceful", "tranquil", "soft", "reflection"]

low = [(f, f.lower()) for f in files]
picked = []
for w in wants:
    for f, fl in low:
        if w in fl and f not in picked:
            picked.append(f)
            break
    if len(picked) >= 3:
        break
# Fallback: top up from the alphabetical list so we always get 3.
for f in sorted(files):
    if len(picked) >= 3:
        break
    if f not in picked:
        picked.append(f)
picked = picked[:3]

if len(picked) < 3:
    print("Catalog has fewer than 3 mp3 files; got:", picked)
    sys.exit(1)

labels = ["sunrise-road.mp3", "coastal-light.mp3", "lantern-evening.mp3"]
ok_all = True
print("Resolved tracks:")
for label, name in zip(labels, picked):
    url = base + urllib.parse.quote(name)
    rc = subprocess.run(["curl", "-fsSL", url, "-o", label]).returncode
    good = False
    if rc == 0 and os.path.exists(label):
        p = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", label],
            capture_output=True, text=True)
        good = bool(p.stdout.strip())
    if not good:
        if os.path.exists(label):
            os.remove(label)
        ok_all = False
        print(f"  FAIL {label}  <-  {name}")
    else:
        print(f"  ok   {label}  <-  {name}")
    print(f"       source: {url}")

# Emit a CREDITS.md block to paste in.
print("\n--- paste into CREDITS.md (CC BY 4.0 attribution) ---")
for label, name in zip(labels, picked):
    title = os.path.splitext(os.path.basename(name))[0]
    print(f"\n### {label}")
    print(f"- Title: {title}")
    print(f"- Artist: Kevin MacLeod (incompetech.com)")
    print(f"- License: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/")
    print(f"- Source: https://archive.org/details/Incompetech")

sys.exit(0 if ok_all else 1)
PY
status=$?

echo "-------------------------------------------"
if [[ "$status" -ne 0 ]]; then
  echo "Some tracks failed. Re-run, or use the CC0 browser route in README.md."
  exit 1
fi
echo "Done. Now: ./verify_music.sh  and paste the credits block into CREDITS.md."
echo "Remember: CC BY 4.0 requires showing the credit to end users."
