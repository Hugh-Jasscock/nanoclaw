#!/bin/bash
# ─── Cache Capper ─────────────────────────────────────────────
# Proactively caps Claude/Container caches every 2 hours.
# Attacks the root cause, not just symptoms.

LOG="$HOME/nanoclaw/logs/cache-capper.log"
TS=$(date '+%Y-%m-%d %H:%M')
log() { echo "$TS — $1" >> "$LOG"; }
FREED=0
free_mb() { du -sm "$1" 2>/dev/null | cut -f1 || echo 0; }

# 1. Claude Desktop cache
for DIR in \
  "$HOME/Library/Caches/com.anthropic.claude" \
  "$HOME/Library/Containers/com.anthropic.claude/Data/Library/Caches"; do
  if [ -d "$DIR" ]; then
    SZ=$(free_mb "$DIR")
    if [ "$SZ" -gt 200 ]; then
      rm -rf "$DIR"/* 2>/dev/null
      log "Claude Desktop cache cleared (${SZ}MB)"
      FREED=$((FREED + SZ))
    fi
  fi
done

# 2. Apple Container — prune stopped containers ONLY.
# DO NOT prune images: nanoclaw-agent is rebuilt locally and ephemeral
# per-message, so between messages it looks "unused" and `image prune -a`
# deletes it, breaking Woodrow until the next manual rebuild.
# See ~/.claude/projects/-Users-wilson/memory/gotcha_apple_container_blob_wipe.md
if command -v container &>/dev/null; then
  container list -a 2>/dev/null | grep stopped | awk '{print $1}' | while read -r cid; do
    container rm "$cid" 2>/dev/null && log "Removed stopped container: $cid"
  done

  # Defensive: if nanoclaw-agent vanished, rebuild it now (~3-5 min) so the
  # next Telegram message doesn't get the docker.io 401 fallback.
  if ! container image list 2>/dev/null | grep -q "^nanoclaw-agent "; then
    log "WARNING: nanoclaw-agent image missing — rebuilding"
    bash "$HOME/nanoclaw/container/build.sh" >>"$LOG" 2>&1 \
      && log "Rebuild succeeded" \
      || log "ERROR: rebuild failed — Woodrow will be down until manual intervention"
  fi
fi
for DIR in \
  "$HOME/.local/share/container" \
  "$HOME/.local/share/containers" \
  "$HOME/Library/Application Support/container"; do
  if [ -d "$DIR" ]; then
    SZ=$(free_mb "$DIR")
    if [ "$SZ" -gt 3000 ]; then
      log "WARNING: Container storage at ${SZ}MB — run: container system prune -f"
    fi
  fi
done

# 3. Claude Code caches (safe)
for DIR in \
  "$HOME/.claude/cache" \
  "$HOME/Library/Caches/claude-code"; do
  if [ -d "$DIR" ]; then
    SZ=$(free_mb "$DIR")
    rm -rf "$DIR"/* 2>/dev/null
    [ "$SZ" -gt 0 ] && log "Claude Code cache cleared (${SZ}MB)" && FREED=$((FREED + SZ))
  fi
done

# 4. npm cache (cap at 500MB)
if [ -d "$HOME/.npm" ]; then
  SZ=$(free_mb "$HOME/.npm")
  if [ "$SZ" -gt 500 ]; then
    npm cache clean --force 2>/dev/null
    log "npm cache cleared (was ${SZ}MB)"
    FREED=$((FREED + SZ))
  fi
fi

# 5. Google Chrome/Updater caches (722MB+ regularly)
# NOTE: com.apple.container/snapshots is intentionally NOT in this list —
# nuking the snapshots dir wholesale can desync the image catalog.
# disk-cleanup.sh handles old snapshots safely (find -mtime +3).
for DIR in \
  "$HOME/Library/Application Support/Google/GoogleUpdater" \
  "$HOME/Library/Application Support/Google/Chrome/Default/Service Worker" \
  "$HOME/Library/Application Support/Google/Chrome/Default/Cache" \
  "$HOME/Library/Caches/dotslash" \
  "$HOME/Library/Application Support/com.apple.wallpaper"; do
  if [ -d "$DIR" ]; then
    SZ=$(free_mb "$DIR")
    if [ "$SZ" -gt 100 ]; then
      rm -rf "$DIR" 2>/dev/null
      log "Cleared $(basename "$DIR") (${SZ}MB)"
      FREED=$((FREED + SZ))
    fi
  fi
done

# 6. NanoClaw logs — keep last 7 days, cap large files
find "$HOME/nanoclaw/logs" -name "*.log" -mtime +7 -delete 2>/dev/null
find "$HOME/nanoclaw/logs" -name "*.log" -size +50M | while read -r f; do
  tail -c 5242880 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  log "Truncated large log: $(basename "$f")"
done

# 6. Homebrew
if command -v brew &>/dev/null; then
  brew cleanup --prune=7 -q 2>/dev/null
  log "Homebrew cleaned"
fi

# 7. macOS general caches (safe)
rm -rf "$HOME/Library/Caches/com.apple.dt."* 2>/dev/null

FREE_NOW=$(df -m / | tail -1 | awk '{print $4}')
[ "$FREED" -gt 0 ] && log "Done — freed ~${FREED}MB | ${FREE_NOW}MB now available"
exit 0
