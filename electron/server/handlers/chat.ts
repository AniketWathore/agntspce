import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'

export function registerChatHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('chat-get-models', ({ _reqId } = {}) => {
    socket.emit('chat-models', { _reqId, models: ctx.chatManager.getModels() })
  })

  socket.on('chat-send', async ({ _reqId, threadId, providerId, content }) => {
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

    const msg = await ctx.chatManager.sendMessage(threadId, providerId, content)
    if (msg.error) {
      socket.emit('chat-error', { _reqId, threadId, error: msg.content })
    } else {
      socket.emit('chat-response', { _reqId, threadId, message: msg })
    }
  })

  socket.on('chat-send-stream', async ({ threadId, providerId, content }) => {
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

    await ctx.chatManager.sendMessageStream(threadId, providerId, content, (chunk) => {
      if (chunk.error) {
        socket.emit('chat-error', { threadId, error: chunk.error })
      } else {
        socket.emit('chat-stream-chunk', chunk)
      }
    })
  })

  socket.on('chat-stop-stream', ({ threadId }) => {
    ctx.chatManager.stopStreaming(threadId)
  })

  socket.on('chat-get-history', ({ _reqId, threadId }) => {
    const messages = ctx.chatManager.getThreadMessages(threadId)
    socket.emit('chat-history', { _reqId, threadId, messages })
  })

  socket.on('chat-update-api-key', ({ providerId, apiKey }) => {
    ctx.chatManager.updateApiKey(providerId, apiKey)
  })

  socket.on('chat-delete-thread', ({ threadId }) => {
    ctx.chatManager.deleteThread(threadId)
  })
}
