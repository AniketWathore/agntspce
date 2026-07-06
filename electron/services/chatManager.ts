import type { AIProvider, ChatMessage, ChatThread, ProviderConfig, ProviderId, StreamChunk } from './chatTypes'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { GeminiProvider } from './providers/gemini'
import { DeepSeekProvider } from './providers/deepseek'

export class ChatManager {
  private providers: Map<ProviderId, AIProvider> = new Map()
  private threads: Map<string, ChatThread> = new Map()
  private configs: Map<ProviderId, ProviderConfig> = new Map()
  private activeAborts: Map<string, AbortController> = new Map()

  constructor() {
    this.loadConfigs()
    this.initProviders()
  }

  private loadConfigs() {
    const defaultConfigs: ProviderConfig[] = [
      { id: 'openai', name: 'OpenAI', model: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY || '' },
      { id: 'anthropic', name: 'Anthropic', model: 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY || '' },
      { id: 'google', name: 'Google Gemini', model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY || '' },
      { id: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY || '' },
    ]
    for (const cfg of defaultConfigs) {
      this.configs.set(cfg.id, cfg)
    }
  }

  private initProviders() {
    for (const [, cfg] of this.configs) {
      this.registerProvider(cfg)
    }
  }

  registerProvider(config: ProviderConfig) {
    this.configs.set(config.id, config)
    switch (config.id) {
      case 'openai':
        this.providers.set(config.id, new OpenAIProvider(config))
        break
      case 'anthropic':
        this.providers.set(config.id, new AnthropicProvider(config))
        break
      case 'google':
        this.providers.set(config.id, new GeminiProvider(config))
        break
      case 'deepseek':
        this.providers.set(config.id, new DeepSeekProvider(config))
        break
    }
  }

  getProviderConfig(providerId: ProviderId): ProviderConfig {
    const cfg = this.configs.get(providerId)
    if (!cfg) throw new Error(`Provider ${providerId} not configured`)
    return cfg
  }

  getProvider(providerId: ProviderId): AIProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider ${providerId} not found`)
    return provider
  }

  getOrCreateThread(threadId: string, providerId: ProviderId): ChatThread {
    let thread = this.threads.get(threadId)
    if (!thread) {
      thread = { id: threadId, providerId, messages: [], createdAt: Date.now(), updatedAt: Date.now() }
      this.threads.set(threadId, thread)
    }
    return thread
  }

  getThreads(): ChatThread[] {
    return Array.from(this.threads.values())
  }

  deleteThread(threadId: string) {
    this.threads.delete(threadId)
  }

  isProviderConfigured(providerId: ProviderId): boolean {
    const provider = this.providers.get(providerId)
    return provider?.isConfigured() ?? false
  }

  getModels(): { id: ProviderId; name: string; model: string; configured: boolean }[] {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      model: provider.model,
      configured: provider.isConfigured(),
    }))
  }

  async sendMessage(
    threadId: string,
    providerId: ProviderId,
    content: string
  ): Promise<ChatMessage> {
    const provider = this.getProvider(providerId)
    if (!provider.isConfigured()) {
      return {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `${provider.name} API key is not configured.`,
        provider: providerId,
        model: provider.model,
        timestamp: Date.now(),
        error: true,
      }
    }

    const thread = this.getOrCreateThread(threadId, providerId)
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      provider: providerId,
      model: provider.model,
      timestamp: Date.now(),
    }
    thread.messages.push(userMsg)

    try {
      const fullText = await provider.chat(thread.messages)
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: fullText,
        provider: providerId,
        model: provider.model,
        timestamp: Date.now(),
      }
      thread.messages.push(assistantMsg)
      thread.updatedAt = Date.now()
      return assistantMsg
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Unknown error'}`,
        provider: providerId,
        model: provider.model,
        timestamp: Date.now(),
        error: true,
      }
      thread.messages.push(errorMsg)
      thread.updatedAt = Date.now()
      return errorMsg
    }
  }

  async sendMessageStream(
    threadId: string,
    providerId: ProviderId,
    content: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const provider = this.getProvider(providerId)
    const thread = this.getOrCreateThread(threadId, providerId)

    if (!provider.isConfigured()) {
      onChunk({
        threadId,
        content: `${provider.name} API key is not configured.`,
        done: true,
      })
      return
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      provider: providerId,
      model: provider.model,
      timestamp: Date.now(),
    }
    thread.messages.push(userMsg)

    const abortController = new AbortController()
    this.activeAborts.set(threadId, abortController)

    let fullText = ''
    try {
      await provider.chatStream(
        thread.messages,
        (chunk) => {
          fullText += chunk
          onChunk({ threadId, content: chunk, done: false })
        },
        abortController.signal
      )

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: fullText,
        provider: providerId,
        model: provider.model,
        timestamp: Date.now(),
      }
      thread.messages.push(assistantMsg)
      thread.updatedAt = Date.now()
      onChunk({ threadId, content: '', done: true })
    } catch (err: any) {
      if (abortController.signal.aborted) {
        onChunk({ threadId, content: '', done: true })
      } else {
        const errMsg = err.message || 'Unknown error'
        onChunk({ threadId, content: errMsg, done: true, error: errMsg })
      }
    } finally {
      this.activeAborts.delete(threadId)
    }
  }

  stopStreaming(threadId: string) {
    const controller = this.activeAborts.get(threadId)
    if (controller) {
      controller.abort()
      this.activeAborts.delete(threadId)
    }
  }

  getThreadMessages(threadId: string): ChatMessage[] {
    return this.threads.get(threadId)?.messages ?? []
  }

  updateApiKey(providerId: ProviderId, apiKey: string) {
    const cfg = this.configs.get(providerId)
    if (cfg) {
      cfg.apiKey = apiKey
      this.registerProvider(cfg)
    }
  }
}
