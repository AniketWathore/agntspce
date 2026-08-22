#!/bin/bash
# Memory profiling experiment for AgntSpce (runs entirely in one shell)
cd /Users/prashik/Aniket/agntspce
rm -f /tmp/agnt-sessions.txt

snap() {
  echo "----- $1 -----"
  /bin/ps -axo pid,ppid,rss,pcpu,args | /usr/bin/grep -E "Electron.app|vite|bin/claude" | /usr/bin/grep -v grep | /usr/bin/awk '{
    rss=$3/1024;
    tag="other";
    if ($0 ~ /type=gpu-process/) tag="gpu";
    else if ($0 ~ /type=utility/) tag="net-util";
    else if ($0 ~ /type=renderer/) tag="renderer";
    else if ($0 ~ /Electron\.app\/Contents\/MacOS\/Electron/) tag="main";
    else if ($0 ~ /vite/) tag="vite";
    else if ($0 ~ /bin\/claude/) tag="agent-claude";
    printf "%8s %-13s %7.0f MB %5s%% cpu\n", $1, tag, rss, $4;
  }' | /usr/bin/head -30
}

echo "== launching npm run electron:dev =="
npm run electron:dev > /tmp/agntspce-dev.log 2>&1 &
DEV_PID=$!

for i in $(seq 1 40); do
  /usr/bin/grep -q "Server running" /tmp/agntspce-dev.log && break
  /bin/sleep 1
done
echo "== server up after ~${i}s =="
/bin/sleep 8
snap "baseline (no agents)"

echo "== adding agent #1 (claude) =="
node ./agnt-tmp-agent.mjs claude
/bin/sleep 45
snap "after agent #1 (+45s)"

echo "== adding agent #2 (claude) =="
node ./agnt-tmp-agent.mjs claude
/bin/sleep 45
snap "after agent #2 (+45s)"

echo "== output flood stress via shell session (~30MB) =="
node - <<'EOF'
import { io } from 'socket.io-client'
import { appendFileSync } from 'node:fs'
const socket = io('http://127.0.0.1:9460')
socket.on('connect', () => {
  socket.emit('create-raw-session', { type: 'shell' })
})
socket.on('session-created', d => {
  console.log('shell session', d.sessionId)
  try { appendFileSync('/tmp/agnt-sessions.txt', d.sessionId + '\n') } catch {}
  socket.emit('terminal-input', { sessionId: d.sessionId, data: 'seq 1 400000\r' })
  setTimeout(() => { socket.disconnect(); process.exit(0) }, 30000)
})
setTimeout(() => process.exit(1), 15000)
EOF

/bin/sleep 15; snap "during flood"
/bin/sleep 45; snap "flood+45s"
/bin/sleep 60; snap "flood+105s"

echo "== cleanup: closing test sessions =="
IDS=$(/bin/cat /tmp/agnt-sessions.txt 2>/dev/null | /usr/bin/tr '\n' ' ')
if [ -n "$IDS" ]; then
node - "$IDS" <<'EOF'
import { io } from 'socket.io-client'
const ids = process.argv[2].trim().split(/\s+/)
const socket = io('http://127.0.0.1:9460')
socket.on('connect', () => {
  console.log('closing', ids)
  socket.emit('close-tab', { sessionIds: ids })
  setTimeout(() => { socket.disconnect(); process.exit(0) }, 2000)
})
setTimeout(() => process.exit(0), 8000)
EOF
fi

kill $DEV_PID 2>/dev/null
/bin/sleep 2
pkill -f "electron/dist-electron/main.js" 2>/dev/null
pkill -f "agntspce/dist-electron/main.js" 2>/dev/null
echo "== done =="
