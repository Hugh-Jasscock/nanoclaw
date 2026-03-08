#!/bin/bash
# Daily backup of Woodrow's memory to iCloud Drive.
# Copies group data (CLAUDE.md, kanban, conversations) with a dated snapshot.

SRC="$HOME/nanoclaw/groups/telegram_main"
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/NanoClaw-Backup"
DATE=$(date +%Y-%m-%d)
LATEST="$DEST/latest"
SNAPSHOT="$DEST/snapshots/$DATE"

mkdir -p "$LATEST" "$SNAPSHOT"

# Sync latest (always up to date)
rsync -a --exclude='logs/' --exclude='images/' "$SRC/" "$LATEST/"

# Daily snapshot (one per day, keeps history)
rsync -a --exclude='logs/' --exclude='images/' "$SRC/" "$SNAPSHOT/"

# Clean up snapshots older than 30 days
find "$DEST/snapshots" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +

echo "$(date): Backup complete → $SNAPSHOT"
