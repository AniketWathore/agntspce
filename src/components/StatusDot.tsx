type Status = 'idle' | 'busy' | 'waiting' | 'exited'

const STATUS_COLORS: Record<Status, string> = {
  idle: '#6b7280',
  busy: '#10b981',
  waiting: '#f59e0b',
  exited: '#ef4444',
}

export default function StatusDot({ status, size = 10 }: { status: string; size?: number }) {
  const color = STATUS_COLORS[status as Status] || '#6b7280'
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  )
}
