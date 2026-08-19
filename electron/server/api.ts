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

  app.get('/api/chat/providers', (_req, res) => {
    res.json(ctx.chatManager.getTemplates())
  })

  app.get('/api/chat/keys', (_req, res) => {
    res.json(ctx.chatManager.getKeys())
  })

  app.post('/api/chat/keys', (req, res) => {
    try {
      const { type, templateId, name, model, apiKey, baseUrl, expiresAt } = req.body || {}
      if (!type || !apiKey || typeof apiKey !== 'string') {
        res.status(400).json({ error: 'type and apiKey are required' })
        return
      }
      const entry = ctx.chatManager.addKey({ type, templateId, name, model, apiKey, baseUrl, expiresAt })
      res.json({ ok: true, key: entry })
    } catch (e) {
      console.error('/api/chat/keys POST error:', e)
      res.status(500).json({ error: String(e) })
    }
  })

  app.put('/api/chat/keys/:id', (req, res) => {
    try {
      const { name, model, apiKey, baseUrl, expiresAt } = req.body || {}
      const entry = ctx.chatManager.updateKey(req.params.id, { name, model, apiKey, baseUrl, expiresAt })
      if (!entry) {
        res.status(404).json({ error: 'API key not found' })
        return
      }
      res.json({ ok: true, key: entry })
    } catch (e) {
      console.error('/api/chat/keys PUT error:', e)
      res.status(500).json({ error: String(e) })
    }
  })

  app.delete('/api/chat/keys/:id', (req, res) => {
    const ok = ctx.chatManager.deleteKey(req.params.id)
    res.json({ ok })
  })

  app.get('/api/chat/models/:id', async (req, res) => {
    try {
      const models = await ctx.chatManager.listProviderModels(req.params.id)
      res.json({ ok: true, models })
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to list models' })
    }
  })

  app.post('/api/chat/models/query', async (req, res) => {
    try {
      const { type, apiKey, baseUrl } = req.body || {}
      if (!type || !apiKey || typeof apiKey !== 'string') {
        res.status(400).json({ error: 'type and apiKey are required' })
        return
      }
      const models = await ctx.chatManager.listModelsForInput({ type, apiKey, baseUrl })
      res.json({ ok: true, models })
    } catch (e: any) {
      console.error('/api/chat/models/query error:', e)
      res.status(400).json({ error: e.message || 'Failed to list models' })
    }
  })

  app.post('/api/report-token-savings', (req, res) => {
    try {
      const { originalTokens, filteredTokens, toolName, sessionId } = req.body
      if (typeof originalTokens !== 'number' || typeof filteredTokens !== 'number') {
        res.status(400).json({ error: 'originalTokens and filteredTokens are required' })
        return
      }
      ctx.sessionManager.outputFilter.reportTokenSavings(originalTokens, filteredTokens, toolName || 'tool', typeof sessionId === 'string' && sessionId ? sessionId : undefined)
      res.json({ ok: true })
    } catch (e) {
      console.error('/api/report-token-savings error:', e)
      res.status(500).json({ error: String(e) })
    }
  })
}
