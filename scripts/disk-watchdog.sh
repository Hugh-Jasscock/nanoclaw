#!/bin/bash
# ─── Disk Watchdog ───────────────────────────────────────────
# Runs every 2 hours. If free space drops below 2GB, runs cleanup and
# alerts the user via Telegram. Does NOT wipe Woodrow's session DB —
# that was a previous design that caused 4 days of amnesia while
# freeing roughly 0 disk (sessions total ~15MB).

LOG="/Users/wilson/nanoclaw/logs/disk-cleanup.log"
STAMP="/Users/wilson/nanoclaw/logs/.watchdog-last-fired"
ENV_FILE="/Users/wilson/nanoclaw/.env"
MAIN_CHAT_ID="8008710154"

FREE_MB=$(df -m / | tail -1 | awk '{print $4}')
[ "$FREE_MB" -ge 2048 ] && exit 0

# Rate-limit: at most one full firing per 24h. Avoids the 2-hour wipe storm
# we just escaped (140 firings in 4 days).
if [ -f "$STAMP" ]; then
  LAST=$(stat -f%m "$STAMP")
  NOW=$(date +%s)
  if [ $((NOW - LAST)) -lt 86400 ]; then
    echo "$(date '+%Y-%m-%d %H:%M') — WATCHDOG: ${FREE_MB}MB free, but rate-limited (last fired $((NOW - LAST))s ago)" >> "$LOG"
    exit 0
  fi
fi
touch "$STAMP"

echo "$(date '+%Y-%m-%d %H:%M') — WATCHDOG: ${FREE_MB}MB free, running emergency cleanup" >> "$LOG"

bash /Users/wilson/nanoclaw/scripts/disk-cleanup.sh

FREE_AFTER=$(df -m / | tail -1 | awk '{print $4}')

# Restart NanoClaw so any in-flight SQLite ENOSPC errors recover.
launchctl kickstart -k gui/$(id -u)/com.nanoclaw 2>/dev/null

# If still tight, ping the user — don't silently destroy state.
if [ "$FREE_AFTER" -lt 1024 ]; then
  MSG="⚠️ NanoClaw watchdog: only ${FREE_AFTER}MB free after cleanup. Manual intervention needed."
  if [ -r "$ENV_FILE" ]; then
    TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
    if [ -n "$TOKEN" ]; then
      curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -d chat_id="$MAIN_CHAT_ID" \
        --data-urlencode text="$MSG" >/dev/null
    fi
  fi
  echo "$(date '+%Y-%m-%d %H:%M') — WATCHDOG: ALERT sent — ${FREE_AFTER}MB free" >> "$LOG"
fi

echo "$(date '+%Y-%m-%d %H:%M') — WATCHDOG: Cleanup done, now ${FREE_AFTER}MB free" >> "$LOG"
