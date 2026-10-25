#!/bin/bash
# SessionStart hook: prepares a Claude Code cloud session for video editing
# (HyperFrames CLI + skills, voice-over, transcription, music, cutouts).
# Idempotent: every step is skipped when its result is already present.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
CACHE="$HOME/.cache/hyperframes"
log() { echo "[montage-setup] $*" >&2; }
# Model downloads are best effort: a blocked host must not fail the session.
fetch() { [ -s "$2" ] || { mkdir -p "$(dirname "$2")"; curl -fsSL -o "$2.part" "$1" && mv "$2.part" "$2"; } || log "download failed: $1"; }

# 1. HyperFrames: dependencies, build, global `hyperframes` command.
cd "$REPO"
log "bun install"
bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null
if [ ! -d packages/cli/dist ]; then
  log "bun run build"
  bun run build >/dev/null
fi
# A wrapper rather than `npm link`, which would chmod tracked files in the repo.
BIN_DIR="$(dirname "$(command -v node)")"
rm -f "$BIN_DIR/hyperframes"
printf '#!/bin/sh\nexec node "%s/packages/cli/bin/hyperframes.mjs" "$@"\n' "$REPO" > "$BIN_DIR/hyperframes"
chmod +x "$BIN_DIR/hyperframes"

# 2. Skills for Claude (core set + on-demand ones).
mkdir -p "$HOME/.claude/skills"
for s in hyperframes hyperframes-cli hyperframes-registry media-use figma slideshow remotion-to-hyperframes; do
  rm -rf "$HOME/.claude/skills/$s"
  cp -r "skills/$s" "$HOME/.claude/skills/$s"
done

# 3. System and Python tools.
command -v espeak-ng >/dev/null || { apt-get update >/dev/null 2>&1 || true; apt-get install -y espeak-ng >/dev/null 2>&1 || log "espeak-ng install failed"; }
PY_PKGS="kokoro-onnx soundfile numpy torch transformers auto-editor scenedetect[opencv] rembg[cli] filetype google-genai python-dotenv requests yt-dlp"
if ! python3 -c "import kokoro_onnx, torch, transformers, rembg, scenedetect" 2>/dev/null; then
  log "pip install"
  pip3 install --quiet --break-system-packages $PY_PKGS 2>&1 | grep -v "^WARNING: Running pip as" || true
fi

# 4. whisper.cpp (transcription / auto captions), built where HyperFrames looks for it.
# GGML_NATIVE is off: cloud VMs advertise CPU features (AVX-512) that crash whisper-cli with SIGILL.
WHISPER="$CACHE/whisper/whisper.cpp"
if [ ! -x "$WHISPER/build/bin/whisper-cli" ]; then
  log "building whisper.cpp"
  rm -rf "$WHISPER"
  mkdir -p "$CACHE/whisper"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$WHISPER" >/dev/null 2>&1
  (cd "$WHISPER" && cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON >/dev/null && cmake --build build --config Release -j"$(nproc)" >/dev/null)
fi

# 5. Models.
HF_WHISPER="https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1"
fetch "$HF_WHISPER/ggml-small.bin" "$CACHE/whisper/models/ggml-small.bin"
KOKORO="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
fetch "$KOKORO/kokoro-v1.0.onnx" "$CACHE/tts/models/kokoro-v1.0.onnx"
fetch "$KOKORO/voices-v1.0.bin" "$CACHE/tts/voices/voices-v1.0.bin"
fetch "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx" \
  "$HOME/.rembg/models/u2net_human_seg/u2net_human_seg.onnx"
# huggingface_hub retries for minutes when its CDN is blocked, so probe it first.
if curl -fsSL -o /dev/null --max-time 20 -r 0-99 "$HF_WHISPER/ggml-small.bin"; then
  # Xet transfers go through hosts the proxy may block; plain CDN downloads work.
  # Only the safetensors weights are needed, not the duplicate .bin checkpoints.
  HF_HUB_DISABLE_XET=1 python3 -c "from huggingface_hub import snapshot_download; snapshot_download('facebook/musicgen-small', allow_patterns=['*.json', '*.model', 'model.safetensors'])" >/dev/null 2>&1 \
    || log "MusicGen model download failed"
else
  log "huggingface CDN unreachable, skipping MusicGen model"
fi

log "ready"
