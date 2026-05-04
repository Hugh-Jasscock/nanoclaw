#!/bin/bash
# ─── NanoClaw Disk Cleanup ──────────────────────────────────
# Runs daily at 4am via launchd. Prevents disk-full crashes.

LOG="/Users/wilson/nanoclaw/logs/disk-cleanup.log"
BEFORE=$(df / | tail -1 | awk '{print $4}')

# 1. Session transcripts older than 2 days. Don't touch the `sessions` table —
# it stores one resume-pointer per group, not a history; deleting it causes
# Woodrow to forget which session to resume. (Old code tried to filter on a
# nonexistent created_at column and silently failed.)
find /Users/wilson/nanoclaw/data/sessions -name "*.jsonl" -mtime +2 -delete 2>/dev/null

# 2. Container logs older than 2 days
find /Users/wilson/nanoclaw/groups -name "container-*.log" -mtime +2 -delete 2>/dev/null

# 3. Truncate main + arb logs if over 5MB
for f in /Users/wilson/nanoclaw/logs/*.log; do
  if [ -f "$f" ] && [ $(stat -f%z "$f" 2>/dev/null || echo 0) -gt 5242880 ]; then
    tail -500 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

# 4. Telegram images older than 7 days
find /Users/wilson/nanoclaw/groups/telegram_main/images -name "tg-*.jpg" -mtime +7 -delete 2>/dev/null

# 5. Claude desktop caches (re-download as needed)
rm -rf "/Users/wilson/Library/Application Support/Claude/vm_bundles"/* 2>/dev/null
rm -rf "/Users/wilson/Library/Application Support/Claude/Cache"/* 2>/dev/null
rm -rf "/Users/wilson/Library/Application Support/Claude/Code Cache"/* 2>/dev/null

# 6. Apple Container old snapshots
find "/Users/wilson/Library/Application Support/com.apple.container/snapshots" -mindepth 1 -mtime +3 -exec rm -rf {} \; 2>/dev/null

# 7. npm cache
npm cache clean --force 2>/dev/null

# 8. General caches older than 3 days
find /Users/wilson/.cache -mindepth 1 -maxdepth 1 -mtime +3 -exec rm -rf {} \; 2>/dev/null

AFTER=$(df / | tail -1 | awk '{print $4}')
FREED=$(( (AFTER - BEFORE) / 2048 ))

if [ "$FREED" -gt 10 ]; then
  echo "$(date '+%Y-%m-%d %H:%M') — Freed ${FREED}MB" >> "$LOG"
fi
