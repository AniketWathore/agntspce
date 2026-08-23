import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'

export function registerChatHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('chat-get-models', ({ _reqId } = {}) => {
    socket.emit('chat-models', { _reqId, models: ctx.chatManager.getModels() })
  })

  socket.on('chat-list-threads', ({ _reqId } = {}) => {
    socket.emit('chat-threads', { _reqId, threads: ctx.chatManager.listThreads() })
  })

  socket.on('chat-create-thread', ({ _reqId, providerId, model } = {}) => {
    try {
      const thread = ctx.chatManager.createThread(providerId || '', model || '')
      socket.emit('chat-thread-created', { _reqId, thread })
    } catch (err: any) {
      socket.emit('chat-error', { _reqId, threadId: null, error: err.message })
    }
  })

  socket.on('chat-rename-thread', ({ threadId, title }) => {
    ctx.chatManager.renameThread(threadId, title)
    socket.emit('chat-threads', { threads: ctx.chatManager.listThreads() })
  })

  socket.on('chat-clear-thread', ({ threadId }) => {
    ctx.chatManager.clearThread(threadId)
    socket.emit('chat-history', { threadId, messages: [] })
  })

  socket.on('chat-send', async ({ _reqId, threadId, providerId, content, model, attachments }) => {
    try {
      const provider = ctx.chatManager.getProvider(providerId)
      if (!provider.isConfigured()) {
        socket.emit('chat-error', { _reqId, threadId, error: `${provider.name} API key is not configured.` })
        return
      }
    } catch (err: any) {
      socket.emit('chat-error', { _reqId, threadId, error: err.message })
      return
    }

    const msg = await ctx.chatManager.sendMessage(threadId, providerId, content, model, attachments)
    if (msg.error) {
      socket.emit('chat-error', { _reqId, threadId, error: msg.content })
    } else {
      socket.emit('chat-response', { _reqId, threadId, message: msg })
    }
  })

  socket.on('chat-send-stream', async ({ threadId, providerId, content, model, attachments }) => {
    try {
      const provider = ctx.chatManager.getProvider(providerId)
      if (!provider.isConfigured()) {
        socket.emit('chat-error', { threadId, error: `${provider.name} API key is not configured.` })
        return
      }
    } catch (err: any) {
      socket.emit('chat-error', { threadId, error: err.message })
      return
    }

    await ctx.chatManager.sendMessageStream(threadId, providerId, content, model, (chunk) => {
      if (chunk.error) {
        socket.emit('chat-error', { threadId, error: chunk.error })
      } else {
        socket.emit('chat-stream-chunk', chunk)
      }
    }, attachments)
  })

  socket.on('chat-stop-stream', ({ threadId }) => {
    ctx.chatManager.stopStreaming(threadId)
  })

  socket.on('chat-get-history', ({ _reqId, threadId }) => {
    const messages = ctx.chatManager.getThreadMessages(threadId)
    socket.emit('chat-history', { _reqId, threadId, messages })
  })

  socket.on('chat-delete-thread', ({ threadId }) => {
    ctx.chatManager.deleteThread(threadId)
    socket.emit('chat-threads', { threads: ctx.chatManager.listThreads() })
  })
}
