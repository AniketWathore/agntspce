import type { Express } from 'express'
import type { ServerContext } from './context'
import { APP_VERSION } from '../config'
import { checkAgentsInstalled } from '../services/agentResolver'

export function registerApiRoutes(app: Express, ctx: ServerContext): void {
  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'ok',
      version: APP_VERSION,
      sessions: ctx.sessionManager.getSessionStates(),
      activeWorkspace: ctx.workspaceManager.getActiveWorkspace()?.name || null,
    })
  })

  app.get('/api/workspaces', (_req, res) => {
    res.json(ctx.workspaceManager.listWorkspaces())
  })

  app.get('/api/sessions', (_req, res) => {
    res.json(ctx.sessionManager.getSessionStates())
  })

  app.get('/api/agents', (_req, res) => {
    const agents = ctx.agentManager.getAllAgents().map(a => ctx.agentManager.getUIConfig(a.id))
    res.json(agents)
  })

  app.get('/api/agents/installed', (_req, res) => {
    const ids = ctx.agentManager.getAllAgents().map(a => a.id)
    res.json(checkAgentsInstalled(ids))
  })

  app.get('/api/chat/models', (_req, res) => {
    res.json(ctx.chatManager.getModels())
  })

  app.post('/api/report-token-savings', (req, res) => {
    try {
      const { originalTokens, filteredTokens, toolName } = req.body
      if (typeof originalTokens !== 'number' || typeof filteredTokens !== 'number') {
        res.status(400).json({ error: 'originalTokens and filteredTokens are required' })
        return
      }
      ctx.sessionManager.outputFilter.reportTokenSavings(originalTokens, filteredTokens, toolName || 'tool')
      res.json({ ok: true })
    } catch (e) {
      console.error('/api/report-token-savings error:', e)
      res.status(500).json({ error: String(e) })
    }
  })
}
