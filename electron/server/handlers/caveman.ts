import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'

export function registerCavemanHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('caveman-toggle', ({ sessionId, enabled, level }: { sessionId: string, enabled: boolean, level?: string }) => {
    ctx.sessionManager.toggleCaveman(sessionId, enabled, level)
    const state = ctx.sessionManager.getCavemanState(sessionId)
    socket.emit('caveman-state', { sessionId, state })
  })

  socket.on('caveman-state', ({ sessionId }: { sessionId: string }, callback?: Function) => {
    const state = ctx.sessionManager.getCavemanState(sessionId)
    if (callback) callback({ ok: true, state })
  })

  socket.on('caveman-all-states', (_data: any, callback?: Function) => {
    const states = ctx.sessionManager.getAllCavemanStates()
    const aggregate = ctx.sessionManager.getCavemanAggregateStats()
    if (callback) callback({ ok: true, states, aggregate })
  })
}
