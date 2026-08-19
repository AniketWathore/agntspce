import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'

export function registerStatsHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('get-cumulative-stats', () => {
    try {
      const result = ctx.sessionManager.outputFilter.getAllStats()
      socket.emit('cumulative-stats', { stats: result[0]?.stats || { totalOriginalBytes: 0, totalFilteredBytes: 0, totalOriginalTokens: 0, totalFilteredTokens: 0, eventsProcessed: 0 } })
    } catch (e) {
      console.error('get-cumulative-stats error:', e)
    }
  })

  socket.on('get-filter-stats', () => {
    try {
      const allSessions = ctx.sessionManager.outputFilter.getAllStats()
      const allCommandHistory = ctx.sessionManager.outputFilter.getAllCommandHistory()
      const aggregated = {
        totalOriginalBytes: allSessions.reduce((s: number, x: any) => s + x.stats.totalOriginalBytes, 0),
        totalFilteredBytes: allSessions.reduce((s: number, x: any) => s + x.stats.totalFilteredBytes, 0),
        totalOriginalTokens: allSessions.reduce((s: number, x: any) => s + x.stats.totalOriginalTokens, 0),
        totalFilteredTokens: allSessions.reduce((s: number, x: any) => s + x.stats.totalFilteredTokens, 0),
        eventsProcessed: allSessions.reduce((s: number, x: any) => s + x.stats.eventsProcessed, 0),
        commandsProcessed: allCommandHistory.length,
      }
      const allHistory = ctx.sessionManager.outputFilter.getAllHistory()
      socket.emit('filter-stats', { stats: aggregated, history: allHistory, commandHistory: allCommandHistory })
    } catch (e) {
      console.error('get-filter-stats error:', e)
    }
  })

  socket.on('report-token-savings', (data: { originalTokens: number; filteredTokens: number; toolName?: string; sessionId?: string }) => {
    try {
      ctx.sessionManager.outputFilter.reportTokenSavings(data.originalTokens, data.filteredTokens, data.toolName, data.sessionId || undefined)
    } catch (e) {
      console.error('report-token-savings error:', e)
    }
  })

  socket.on('reset-filter-stats', () => {
    ctx.sessionManager.outputFilter.reset()
  })

  socket.on('get-command-filter-history', ({ sessionId }: { sessionId?: string }, callback?: Function) => {
    if (sessionId) {
      const history = ctx.sessionManager.outputFilter.getCommandHistory(sessionId)
      if (callback) callback?.({ ok: true, history })
    } else {
      const allHistory = ctx.sessionManager.outputFilter.getAllCommandHistory()
      if (callback) callback?.({ ok: true, history: allHistory })
    }
  })

  socket.on('get-orchestrator-stats', async (_data: any, callback?: Function) => {
    try {
      callback?.({
        ok: true,
        concurrency: ctx.agentOrchestrator.getConcurrencyLoad(),
        sessionCount: ctx.agentOrchestrator.getSessionCount(),
        totalMemoryMB: ctx.agentOrchestrator.getTotalMemoryMB(),
        resourceUsage: ctx.agentOrchestrator.getAllResourceUsage(),
        orchestration: ctx.agentOrchestrator.getOrchestrationStats(),
      })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-session-usage', async ({ sessionId }: { sessionId: string }, callback?: Function) => {
    try {
      const usage = ctx.agentOrchestrator.getResourceUsage(sessionId)
      callback?.({ ok: true, usage })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-session-history', async (_data: any, callback?: Function) => {
    try {
      callback?.({ ok: true, history: ctx.sessionManager.getSessionHistory() })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-token-usage', async ({ sessionId }: { sessionId: string }, callback?: Function) => {
    try {
      const all = ctx.sessionManager.tokenUsageTracker.getAllUsage()
      if (sessionId) {
        callback?.({ ok: true, usage: ctx.sessionManager.tokenUsageTracker.getUsage(sessionId) })
      } else {
        callback?.({ ok: true, usage: all, totalTokens: all.reduce((s: number, u: any) => s + u.totalTokens, 0), totalCost: all.reduce((s: number, u: any) => s + u.estimatedCost, 0) })
      }
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })
}
