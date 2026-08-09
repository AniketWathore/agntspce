import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { isAllowedCorsOrigin, MAX_JSON_BODY_SIZE, MAX_PORT_RETRIES, SERVER_HOST, SERVER_PORT } from '../config'
import { createServerContext, type ServerContext } from './context'
import { registerApiRoutes } from './api'
import { registerAllHandlers } from './handlers'
import type { StateManager } from '../services/orchestration/stateManager'

export interface ServerHandle {
  io: Server
  httpServer: ReturnType<typeof createServer>
  ctx: ServerContext
  listen: () => void
}

export function bootstrapServer(userDataPath: string, rebuildMenu: () => void, stateManager?: StateManager | null): ServerHandle {
  const expressApp = express()
  const httpServer = createServer(expressApp)
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
    },
  })

  expressApp.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })
  expressApp.use(express.json({ limit: MAX_JSON_BODY_SIZE }))

  const ctx = createServerContext({ io, httpServer, expressApp, userDataPath, rebuildMenu, stateManager })

  registerApiRoutes(expressApp, ctx)

  io.on('connection', (socket) => {
    const activeWs = ctx.workspaceManager.getActiveWorkspace()
    socket.emit('workspace-info', {
      active: activeWs,
      available: ctx.workspaceManager.listWorkspaces(),
      config: ctx.workspaceManager.getConfig(),
    })
    socket.emit('sessions', ctx.sessionManager.getSessionStates())

    const backlog = ctx.sessionManager.getUndeliveredOutputAndMarkDelivered()
    if (Object.keys(backlog).length > 0) {
      socket.emit('backlog', backlog)
    }

    registerAllHandlers(ctx, socket)
  })

  const listen = () => {
    function listenWithRetry(attempt: number) {
      const server = httpServer.listen(SERVER_PORT, SERVER_HOST)
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES) {
          console.log(`[server] Port ${SERVER_PORT} in use, retrying in 500ms (attempt ${attempt + 1}/${MAX_PORT_RETRIES})`)
          server.close()
          setTimeout(() => listenWithRetry(attempt + 1), 500)
        } else {
          console.error(`[server] Failed to bind to port ${SERVER_PORT}:`, err.message)
        }
      })
      server.on('listening', () => {
        console.log(`Server running on http://${SERVER_HOST}:${SERVER_PORT}`)
      })
    }

    listenWithRetry(0)
  }

  return { io, httpServer, ctx, listen }
}
