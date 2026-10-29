#!/bin/bash
# Render a built episode: the long-form video and every Short, into <episode-dir>/out/.
#   render_episode.sh series/<show>/<episode-dir> [long|shorts|<short-id>] [--quality draft]
set -euo pipefail
EP="$(cd "$1" && pwd)"
WHAT="${2:-all}"
QUALITY="${3:-looks}"
mkdir -p "$EP/out"
render() { # project dir, output file
  echo "[render] $(basename "$2")"
  npx hyperframes render "$1" -o "$2" --quality "$QUALITY" --quiet
}
if [ "$WHAT" = all ] || [ "$WHAT" = long ]; then
  render "$EP/build/long" "$EP/out/long.mp4"
fi
for d in "$EP"/build/shorts/*/; do
  id="$(basename "$d")"
  if [ "$WHAT" = all ] || [ "$WHAT" = shorts ] || [ "$WHAT" = "$id" ]; then
    render "$d" "$EP/out/$id.mp4"
  fi
done
cp "$EP"/build/*.srt "$EP/out/" 2>/dev/null || true
ls -lh "$EP/out"
