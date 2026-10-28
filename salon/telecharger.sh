#!/bin/bash
# telecharger.sh <lien-dossier-drive> [dossier] : télécharge les rushs du Drive et les range par client (clients.json).
# Le lien n'est volontairement pas enregistré dans le dépôt (public) : le redemander au salon.
# Le dossier doit être partagé en « Tous les utilisateurs disposant du lien ».
set -euo pipefail
cd "$(dirname "$0")"
URL="$1"; DEST="${2:-rushs}"; mkdir -p "$DEST/_drive"
command -v gdown >/dev/null || pip3 install -q --break-system-packages gdown
# gdown liste le dossier ; le téléchargement direct passe par drive.usercontent.google.com.
gdown --folder "$URL" -O "$DEST/_liste" 2>&1 | grep -a "^Processing file" | awk '{print $3, $4}' > "$DEST/_drive/liste.txt" || true
xargs -P 4 -n 2 sh -c '[ -s "'"$DEST"'/_drive/$1" ] || { curl -sSfL --retry 3 -o "'"$DEST"'/_drive/$1.part" "https://drive.usercontent.google.com/download?id=$0&export=download&confirm=t" && mv "'"$DEST"'/_drive/$1.part" "'"$DEST"'/_drive/$1"; }' < "$DEST/_drive/liste.txt"
python3 -I - "$DEST" <<'PY'
import json,os,sys
d=sys.argv[1]; base=os.path.abspath(f"{d}/_drive")
for c,fs in json.load(open("clients.json")).items():
    os.makedirs(f"{d}/{c}",exist_ok=True)
    for f in fs:
        if not os.path.lexists(f"{d}/{c}/{f}"): os.symlink(f"{base}/{f}",f"{d}/{c}/{f}")
print("rushs rangés dans",d)
PY
