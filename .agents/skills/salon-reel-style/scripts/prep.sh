#!/bin/bash
# prep.sh <dossier-client> : copies légères SDR, planches horodatées et mouvement pour chaque vidéo.
set -euo pipefail
C="$1"; W="$C/_travail"; mkdir -p "$W/proxy" "$W/sheets" "$W/motion"
TM="zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
ls "$C"/*.mp4 | xargs -P 3 -I{} bash -c '
  b=$(basename {} .mp4); W="'"$W"'"
  [ -s "$W/proxy/$b.mp4" ] || ffmpeg -v error -y -i {} -vf "'"$TM"',scale=360:640" -r 30 -an -c:v libx264 -preset veryfast -crf 23 "$W/proxy/$b.mp4"
  ffmpeg -v error -y -i "$W/proxy/$b.mp4" -vf "fps=0.5,scale=120:-1,drawtext=text=%{pts\\:hms}:x=2:y=2:fontsize=11:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=12x3" -frames:v 1 "$W/sheets/$b.png"
  ffmpeg -hide_banner -i "$W/proxy/$b.mp4" -vf "scale=90:160,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$W/motion/$b.txt" -f null - 2>/dev/null'
for f in "$C"/*.mp4; do printf "%s %.1fs\n" "$(basename "$f")" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done
