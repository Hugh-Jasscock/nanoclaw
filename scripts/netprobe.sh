#!/bin/bash
# Network probe: runs every minute via launchd (com.nanoclaw.netprobe).
# Checks outbound HTTPS to Anthropic and Telegram and logs only failures (plus
# an hourly heartbeat), with context to help find out why the Mac intermittently
# gets "connection refused". Only IPv4 counts as a failure: this network has no
# working IPv6 (checked 2026-10-13), and the host and containers both prefer IPv4.
# IPv6 results are still recorded alongside each failure.
#
# After an outage of OUTAGE_RESTART_MIN minutes or more, NanoClaw is restarted
# once no agent containers are running, to clear any connection or state left
# stuck by the outage (e.g. internet dropping overnight).

export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LOG="$HOME/nanoclaw/logs/netprobe.log"
STATE="$HOME/nanoclaw/logs/.netprobe-state"
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
OUTAGE_RESTART_MIN=10
# Give up waiting for containers to go idle after this long
RESTART_WAIT_MAX_MIN=120
now=$(date '+%Y-%m-%d %H:%M:%S')
failed=0
results=""

for host in api.anthropic.com api.telegram.org; do
  for fam in 4 6; do
    out=$(curl -"$fam" -sS -o /dev/null --connect-timeout 5 -m 10 \
      -w '%{http_code} %{remote_ip} connect=%{time_connect}s' "https://$host/" 2>&1)
    rc=$?
    if [ $rc -ne 0 ]; then
      [ "$fam" = 4 ] && failed=1
      results+="  FAIL $host ipv$fam curl_exit=$rc $(echo "$out" | tr '\n' ' ')"$'\n'
    else
      results+="  ok   $host ipv$fam $out"$'\n'
    fi
  done
done

if [ $failed -eq 1 ]; then
  {
    echo "[$now] PROBE FAILED"
    printf '%s' "$results"
    echo "  default route: $(route -n get default 2>/dev/null | awk '/gateway|interface/{printf "%s ", $0}')"
    gw=$(route -n get default 2>/dev/null | awk '/gateway/{print $2}')
    [ -n "$gw" ] && echo "  gateway ping: $(ping -c1 -t2 "$gw" 2>&1 | grep -E 'time=|loss' | head -1)"
    echo "  tcp established: $(netstat -an -p tcp | grep -c ESTABLISHED)  time_wait: $(netstat -an -p tcp | grep -c TIME_WAIT)"
    echo "  tailscale: $("$TS" status --self 2>&1 | head -1)"
    echo "  containers running: $(container ls -q 2>/dev/null | tr '\n' ' ')"
  } >> "$LOG"
elif [ "$(date +%M)" = "00" ]; then
  echo "[$now] heartbeat ok" >> "$LOG"
fi

# Track outages: down_since=<epoch> while down, restart_pending=<epoch> after a long one
down_since=$(sed -n 's/^down_since=//p' "$STATE" 2>/dev/null)
restart_pending=$(sed -n 's/^restart_pending=//p' "$STATE" 2>/dev/null)
epoch=$(date +%s)
if [ $failed -eq 1 ]; then
  [ -z "$down_since" ] && down_since=$epoch
elif [ -n "$down_since" ]; then
  mins=$(( (epoch - down_since) / 60 ))
  echo "[$now] RECOVERED after ${mins} min" >> "$LOG"
  [ $mins -ge $OUTAGE_RESTART_MIN ] && restart_pending=$epoch
  down_since=""
fi

if [ $failed -eq 0 ] && [ -n "$restart_pending" ]; then
  if [ -z "$(container ls -q 2>/dev/null)" ]; then
    launchctl kickstart -k "gui/$(id -u)/com.nanoclaw"
    echo "[$now] restarted NanoClaw after outage" >> "$LOG"
    restart_pending=""
  elif [ $(( (epoch - restart_pending) / 60 )) -ge $RESTART_WAIT_MAX_MIN ]; then
    echo "[$now] skipped post-outage restart: containers stayed busy" >> "$LOG"
    restart_pending=""
  fi
fi

{ [ -n "$down_since" ] && echo "down_since=$down_since"
  [ -n "$restart_pending" ] && echo "restart_pending=$restart_pending"; } > "$STATE"

# Keep the log bounded
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG")" -gt 5000000 ]; then
  tail -c 2500000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
