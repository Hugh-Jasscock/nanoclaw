#!/bin/bash
# Start Pinchtab server with a TCP forwarder so containers can reach it.
# Used by launchd (com.pinchtab.plist).
#
# Pinchtab's "simple strategy" auto-launches a browser instance on first
# browse command, but only proxies requests arriving via localhost (Host
# header check). Containers access the host via 192.168.64.1, which fails
# that check. We solve this by running pinchtab on 127.0.0.1:9867 and
# forwarding 0.0.0.0:19867 → 127.0.0.1:9867 so the Host header is rewritten.

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
export PINCHTAB_HEADLESS=true
export PINCHTAB_PORT=9867

# Start the pinchtab server (binds to 127.0.0.1 by default)
pinchtab &
SERVER_PID=$!

# Wait for it to be ready
for i in $(seq 1 15); do
  if curl -s http://127.0.0.1:9867/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# TCP forwarder: 0.0.0.0:19867 → 127.0.0.1:9867
# This rewrites the Host header so pinchtab sees localhost connections
python3 -c "
import socket, threading, signal, sys

def forward(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data: break
            dst.sendall(data)
    except: pass
    finally:
        try: src.close()
        except: pass
        try: dst.close()
        except: pass

def handle(client):
    upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        upstream.connect(('127.0.0.1', 9867))
    except:
        client.close()
        return
    t1 = threading.Thread(target=forward, args=(client, upstream), daemon=True)
    t2 = threading.Thread(target=forward, args=(upstream, client), daemon=True)
    t1.start()
    t2.start()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('0.0.0.0', 19867))
srv.listen(32)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
while True:
    client, _ = srv.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
" &
PROXY_PID=$!

# Clean up on exit
trap "kill $SERVER_PID $PROXY_PID 2>/dev/null" EXIT

# Wait for the server process
wait $SERVER_PID
