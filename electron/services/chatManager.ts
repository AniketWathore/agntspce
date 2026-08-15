import type {
  AIProvider,
  ApiKeyEntry,
  ChatMessage,
  ChatModelInfo,
  ChatThread,
  KeySummary,
  ProviderTemplate,
  ProviderType,
  StreamChunk,
} from './chatTypes'
import { getProviderTemplate, PROVIDER_TEMPLATES } from './providerTemplates'
import { OpenAICompatibleProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { GeminiProvider } from './providers/gemini'
import { DeepSeekProvider } from './providers/deepseek'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export interface AddKeyInput {
  type: ProviderType
  templateId?: string
  name?: string
  model?: string
  apiKey: string
  baseUrl?: string
  expiresAt?: number | null
}

export interface UpdateKeyInput {
  name?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  expiresAt?: number | null
}

export class ChatManager {
  private providers: Map<string, AIProvider> = new Map()
  private keys: Map<string, ApiKeyEntry> = new Map()
  private threads: Map<string, ChatThread> = new Map()
  private activeAborts: Map<string, AbortController> = new Map()
  private configFilePath = path.join(app.getPath('userData'), 'chat-config.json')
  private historyFilePath = path.join(app.getPath('userData'), 'chat-history.json')

  constructor() {
    this.loadConfigs()
    this.loadThreads()
    this.initProviders()
  }

  private loadConfigs() {
    try {
      const content = fs.readFileSync(this.configFilePath, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.providers && typeof parsed.providers === 'object') {
        for (const [id, raw] of Object.entries(parsed.providers as Record<string, Partial<ApiKeyEntry>>)) {
          if (!raw || typeof raw !== 'object') continue
          this.keys.set(id, {
            id,
            type: raw.type || 'openai-compatible',
            name: raw.name || 'Provider',
            model: raw.model || 'gpt-4o',
            apiKey: raw.apiKey || '',
            baseUrl: raw.baseUrl,
            expiresAt: raw.expiresAt ?? null,
            createdAt: raw.createdAt || Date.now(),
            updatedAt: raw.updatedAt || Date.now(),
          })
        }
        return
      }
    } catch {}
    this.migrateLegacyConfig()
  }

  private migrateLegacyConfig() {
    try {
      const content = fs.readFileSync(this.configFilePath, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && !parsed.providers) {
        let migrated = false
        for (const [id, key] of Object.entries(parsed)) {
          if (typeof key === 'string' && key) {
            const template = getProviderTemplate(id)
            if (template) {
              this.keys.set(id, {
                id,
                type: template.type,
                name: template.name,
                model: template.defaultModel,
                apiKey: key,
                baseUrl: template.baseUrl,
                expiresAt: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              migrated = true
            }
          }
        }
        if (migrated) this.saveConfigs()
      }
    } catch {}
  }

  private saveConfigs() {
    try {
      const providers: Record<string, ApiKeyEntry> = {}
      for (const [id, entry] of this.keys) {
        providers[id] = { ...entry }
      }
      fs.mkdirSync(path.dirname(this.configFilePath), { recursive: true })
      fs.writeFileSync(this.configFilePath, JSON.stringify({ providers }, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save chat config:', e)
    }
  }

  private loadThreads() {
    try {
      const content = fs.readFileSync(this.historyFilePath, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.threads)) {
        for (const t of parsed.threads) {
          if (t && typeof t.id === 'string') this.threads.set(t.id, t as ChatThread)
        }
      }
    } catch {}
  }

  private saveThreads() {
    try {
      fs.mkdirSync(path.dirname(this.historyFilePath), { recursive: true })
      fs.writeFileSync(
        this.historyFilePath,
        JSON.stringify({ threads: Array.from(this.threads.values()) }, null, 2),
        'utf-8'
      )
    } catch (e) {
      console.error('Failed to save chat history:', e)
    }
  }

  private initProviders() {
    this.providers.clear()
    for (const [, entry] of this.keys) {
      const provider = this.buildProvider(entry)
      if (provider) this.providers.set(entry.id, provider)
    }
  }

  private buildProvider(entry: ApiKeyEntry): AIProvider | null {
    switch (entry.type) {
      case 'anthropic':
        return new AnthropicProvider(entry)
      case 'google':
        return new GeminiProvider(entry)
      case 'deepseek':
        return new DeepSeekProvider(entry)
      case 'openai':
      case 'openai-compatible':
        return new OpenAICompatibleProvider(entry)
      default:
        return null
    }
  }

  getTemplates(): ProviderTemplate[] {
    return PROVIDER_TEMPLATES
  }

  getKeys(): KeySummary[] {
    return Array.from(this.keys.values()).map(k => ({
      id: k.id,
      type: k.type,
      name: k.name,
      model: k.model,
      baseUrl: k.baseUrl,
      hasKey: !!k.apiKey,
      maskedKey: this.maskKey(k.apiKey),
      expiresAt: k.expiresAt ?? null,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    }))
  }

  getKey(id: string): ApiKeyEntry | undefined {
    return this.keys.get(id)
  }

  private maskKey(key: string): string {
    if (!key) return ''
    if (key.length <= 8) return '••••••••'
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
  }

  addKey(input: AddKeyInput): ApiKeyEntry {
    const template = getProviderTemplate(input.templateId || input.type)
    const fixed = template && !template.custom
    const id = fixed && template ? template.id : makeId('custom')
    const now = Date.now()
    const entry: ApiKeyEntry = {
      id,
      type: input.type,
      name: input.name?.trim() || template?.name || 'Provider',
      model: input.model?.trim() || template?.defaultModel || 'gpt-4o',
      apiKey: input.apiKey.trim(),
      baseUrl: input.baseUrl?.trim() || template?.baseUrl || undefined,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    }
    const existing = this.keys.get(id)
    if (existing) entry.createdAt = existing.createdAt
    this.keys.set(id, entry)
    this.initProviders()
    this.saveConfigs()
    return entry
  }

  updateKey(id: string, updates: UpdateKeyInput): ApiKeyEntry | null {
    const entry = this.keys.get(id)
    if (!entry) return null
    if (updates.name !== undefined) entry.name = updates.name.trim() || entry.name
    if (updates.model !== undefined) entry.model = updates.model.trim() || entry.model
    if (updates.apiKey !== undefined) entry.apiKey = updates.apiKey.trim()
    if (updates.baseUrl !== undefined) entry.baseUrl = updates.baseUrl?.trim() || undefined
    if (updates.expiresAt !== undefined) entry.expiresAt = updates.expiresAt
    entry.updatedAt = Date.now()
    this.initProviders()
    this.saveConfigs()
    return entry
  }

  deleteKey(id: string): boolean {
    if (!this.keys.delete(id)) return false
    this.providers.delete(id)
    this.saveConfigs()
    return true
  }

  isKeyExpired(id: string): boolean {
    const entry = this.keys.get(id)
    if (!entry?.expiresAt) return false
    return Date.now() > entry.expiresAt
  }

  getModels(): ChatModelInfo[] {
    return Array.from(this.providers.values()).map(p => {
      const entry = this.keys.get(p.id)
      const hasKey = p.isConfigured()
      return {
        id: p.id,
        type: entry?.type || 'openai-compatible',
        name: p.name,
        model: p.model,
        baseUrl: p.baseUrl,
        hasKey,
        configured: hasKey && !this.isKeyExpired(p.id),
      }
    })
  }

  getProvider(providerId: string): AIProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider ${providerId} not configured`)
    return provider
  }

  async listProviderModels(providerId: string): Promise<string[]> {
    const provider = this.getProvider(providerId)
    return provider.listModels()
  }

  async listModelsForInput(input: {
    type: ProviderType
    apiKey: string
    baseUrl?: string
  }): Promise<string[]> {
    if (!input.apiKey) return []
    const entry: ApiKeyEntry = {
      id: 'test',
      type: input.type,
      name: 'Test',
      model: '',
      apiKey: input.apiKey,
      baseUrl: input.baseUrl || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const provider = this.buildProvider(entry)
    if (!provider) return []
    return provider.listModels()
  }

  listThreads(): ChatThread[] {
    return Array.from(this.threads.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getThread(threadId: string): ChatThread | null {
    return this.threads.get(threadId) ?? null
  }

  getThreadMessages(threadId: string): ChatMessage[] {
    return this.threads.get(threadId)?.messages ?? []
  }

  createThread(providerId: string, model: string): ChatThread {
    const thread: ChatThread = {
      id: makeId('thread'),
      title: 'New chat',
      providerId,
      model,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.threads.set(thread.id, thread)
    this.saveThreads()
    return thread
  }

  renameThread(threadId: string, title: string): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false
    thread.title = title.trim().slice(0, 80) || thread.title
    thread.updatedAt = Date.now()
    this.saveThreads()
    return true
  }

  deleteThread(threadId: string): boolean {
    if (!this.threads.delete(threadId)) return false
    this.activeAborts.delete(threadId)
    this.saveThreads()
    return true
  }

  clearThread(threadId: string): boolean {
    const thread = this.threads.get(threadId)
    if (!thread) return false
    thread.messages = []
    thread.updatedAt = Date.now()
    this.saveThreads()
    return true
  }

  private getOrCreateThread(threadId: string, providerId: string, model: string): ChatThread {
    let thread = this.threads.get(threadId)
    if (!thread) {
      thread = {
        id: threadId,
        title: 'New chat',
        providerId,
        model,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      this.threads.set(threadId, thread)
    }
    return thread
  }

  private persistMessage(thread: ChatThread) {
    thread.updatedAt = Date.now()
    if (thread.title === 'New chat') {
      const first = thread.messages.find(m => m.role === 'user')
      if (first) {
        const text = first.content.replace(/\s+/g, ' ').trim()
        thread.title = text.length > 60 ? `${text.slice(0, 60)}…` : text || 'New chat'
      }
    }
    this.saveThreads()
  }

  async sendMessage(
    threadId: string,
    providerId: string,
    content: string,
    model?: string
  ): Promise<ChatMessage> {
    const provider = this.getProvider(providerId)
    if (!provider.isConfigured()) {
      return {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `${provider.name} API key is not configured.`,
        provider: providerId,
        model: model || provider.model,
        timestamp: Date.now(),
        error: true,
      }
    }

    const thread = this.getOrCreateThread(threadId, providerId, model || provider.model)
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      provider: providerId,
      model: model || provider.model,
      timestamp: Date.now(),
    }
    thread.messages.push(userMsg)

    try {
      const fullText = await provider.chat(thread.messages, model || provider.model)
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: fullText,
        provider: providerId,
        model: model || provider.model,
        timestamp: Date.now(),
      }
      thread.messages.push(assistantMsg)
      this.persistMessage(thread)
      return assistantMsg
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Unknown error'}`,
        provider: providerId,
        model: model || provider.model,
        timestamp: Date.now(),
        error: true,
      }
      thread.messages.push(errorMsg)
      this.persistMessage(thread)
      return errorMsg
    }
  }

  async sendMessageStream(
    threadId: string,
    providerId: string,
    content: string,
    model: string | undefined,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const provider = this.getProvider(providerId)
    const resolvedModel = model || provider.model
    const thread = this.getOrCreateThread(threadId, providerId, resolvedModel)

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
      model: resolvedModel,
      timestamp: Date.now(),
    }
    thread.messages.push(userMsg)

    const abortController = new AbortController()
    this.activeAborts.set(threadId, abortController)

    let fullText = ''
    try {
      await provider.chatStream(
        thread.messages,
        resolvedModel,
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
        model: resolvedModel,
        timestamp: Date.now(),
      }
      thread.messages.push(assistantMsg)
      this.persistMessage(thread)
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
}
