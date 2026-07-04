import { useEffect, useState, useRef, useCallback } from 'react'
import type { SessionState } from '../types'

interface ActivityEvent {
  id: string
  type: 'session-created' | 'session-exited' | 'status-change' | 'branch-change' | 'session-restarted'
  sessionId: string
  agentType: string
  detail: string
  timestamp: number
}

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude',
  opencode: 'Opencode',
  codex: 'Codex',
  gemini: 'Gemini',
  'cursor-agent': 'Cursor Agent',
  copilot: 'Copilot',
  mastracode: 'Mastra Code',
  droid: 'Droid',
  amp: 'Amp',
  pi: 'Pi',
  shell: 'Shell',
  server: 'Server',
}

function typeLabel(t: string): string {
  return AGENT_LABELS[t] || t
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  sessions: Record<string, SessionState>
  maxEvents?: number
}

export default function ActivityFeed({ sessions, maxEvents = 50 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const prevSessionsRef = useRef<Record<string, SessionState>>({})

  useEffect(() => {
    const prev = prevSessionsRef.current
    const prevIds = new Set(Object.keys(prev))
    const currIds = new Set(Object.keys(sessions))
    const newEvents: ActivityEvent[] = []

    for (const id of currIds) {
      if (!prevIds.has(id)) {
        const s = sessions[id]
        newEvents.push({
          id: `created-${id}`,
          type: 'session-created',
          sessionId: id,
          agentType: s.type,
          detail: `${typeLabel(s.type)} session started`,
          timestamp: Date.now(),
        })
      } else {
        const prevS = prev[id]
        const currS = sessions[id]
        if (prevS.status !== currS.status) {
          newEvents.push({
            id: `status-${id}-${currS.status}-${Date.now()}`,
            type: 'status-change',
            sessionId: id,
            agentType: currS.type,
            detail: `${typeLabel(currS.type)} session ${currS.status}`,
            timestamp: Date.now(),
          })
        }
        if (prevS.branch !== currS.branch && currS.branch) {
          newEvents.push({
            id: `branch-${id}-${currS.branch}-${Date.now()}`,
            type: 'branch-change',
            sessionId: id,
            agentType: currS.type,
            detail: `${typeLabel(currS.type)} switched to ${currS.branch}`,
            timestamp: Date.now(),
          })
        }
      }
    }

    for (const id of prevIds) {
      if (!currIds.has(id)) {
        const s = prev[id]
        newEvents.push({
          id: `exited-${id}`,
          type: 'session-exited',
          sessionId: id,
          agentType: s.type,
          detail: `${typeLabel(s.type)} session closed`,
          timestamp: Date.now(),
        })
      }
    }

    if (newEvents.length > 0) {
      setEvents(prev => {
        const combined = [...newEvents, ...prev]
        return combined.slice(0, maxEvents)
      })
    }

    prevSessionsRef.current = sessions
  }, [sessions, maxEvents])

  const clearEvents = useCallback(() => setEvents([]), [])

  const iconForType = (type: string): string => {
    const map: Record<string, string> = {
      'session-created': '▶',
      'session-exited': '◀',
      'status-change': '●',
      'branch-change': '⑂',
      'session-restarted': '↻',
    }
    return map[type] || '●'
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <h3>Activity</h3>
        <button className="activity-feed-clear" onClick={clearEvents} title="Clear">Clear</button>
      </div>
      <div className="activity-feed-list">
        {events.map(event => (
          <div key={event.id} className={`activity-feed-item activity-${event.type}`}>
            <span className="activity-feed-icon">{iconForType(event.type)}</span>
            <div className="activity-feed-content">
              <span className="activity-feed-detail">{event.detail}</span>
              <span className="activity-feed-time">{timeAgo(event.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
