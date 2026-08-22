import { io } from 'socket.io-client'
const socket = io('http://127.0.0.1:9460')
const type = process.argv[2] || 'claude'
socket.on('connect', () => {
  console.log('connected', socket.id)
  socket.emit('create-agent-session', {
    type,
    config: { agentId: type, mode: 'fresh', flags: [] },
  })
})
import { appendFileSync } from 'node:fs'
socket.on('session-created', d => {
  console.log('session-created', d.sessionId)
  try { appendFileSync('/tmp/agnt-sessions.txt', d.sessionId + '\n') } catch {}
  socket.disconnect(); process.exit(0)
})
socket.on('error', e => { console.log('error', JSON.stringify(e)); process.exit(1) })
setTimeout(() => { console.log('timeout'); process.exit(1) }, 10000)
