#!/bin/bash
# Daily local backup of Woodrow's group data.
# Despite the legacy filename, iCloud Desktop & Documents sync is OFF — this
# writes only to the local ~/Documents/NanoClaw-Backup tree.

SRC="$HOME/nanoclaw/groups/telegram_main"
DEST="$HOME/Documents/NanoClaw-Backup"
DATE=$(date +%Y-%m-%d)
LATEST="$DEST/latest"
SNAPSHOT="$DEST/snapshots/$DATE"
LOG="$HOME/nanoclaw/logs/backup.log"

# Skip backup if the disk is too tight to safely write a snapshot.
FREE_GB=$(df -g / | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt 20 ]; then
  echo "$(date '+%Y-%m-%d %H:%M') — Backup skipped: only ${FREE_GB}GB free (need 20GB)" >> "$LOG"
  exit 0
fi

mkdir -p "$LATEST" "$SNAPSHOT"

EXCLUDES=(
  --exclude='logs/'
  --exclude='images/'
  --exclude='node_modules/'
  --exclude='.git/'
  --exclude='.next/'
  --exclude='.expo/'
  --exclude='dist/'
  --exclude='build/'
  --exclude='.cache/'
  --exclude='.DS_Store'
)

rsync -a --delete "${EXCLUDES[@]}" "$SRC/" "$LATEST/"
rsync -a "${EXCLUDES[@]}" "$SRC/" "$SNAPSHOT/"

# Keep last 7 daily snapshots (was 30 — 154 GiB stranded in iCloud taught us better).
find "$DEST/snapshots" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "$(date '+%Y-%m-%d %H:%M') — Backup complete → $SNAPSHOT" >> "$LOG"
