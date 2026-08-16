import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import type { AIProvider, ApiKeyEntry, ChatMessage } from '../chatTypes'

const ANTHROPIC_API = 'https://api.anthropic.com'

export class AnthropicProvider implements AIProvider {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly baseUrl?: string
  private apiKey: string

  constructor(config: ApiKeyEntry) {
    this.id = config.id
    this.name = config.name
    this.model = config.model
    this.baseUrl = config.baseUrl
    this.apiKey = config.apiKey
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0
  }

  private getClient() {
    return createAnthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl || undefined,
    })
  }

  async listModels(): Promise<string[]> {
    if (!this.isConfigured()) return []
    try {
      const base = (this.baseUrl || ANTHROPIC_API).replace(/\/$/, '')
      const res = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (!res.ok) return []
      const data = await res.json()
      const models = data?.data?.map((m: any) => m.id).filter(Boolean)
      return Array.isArray(models) ? models : []
    } catch {
      return []
    }
  }

  private buildMessages(messages: ChatMessage[]) {
    const sysMsg = messages.filter(m => m.role === 'system').pop()
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    return { sysMsg, chatMessages }
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isConfigured()) throw new Error(`${this.name} API key is not configured`)

    const client = this.getClient()
    const { sysMsg, chatMessages } = this.buildMessages(messages)
    const result = streamText({
      model: client.chat(model || this.model),
      messages: chatMessages,
      ...(sysMsg ? { system: sysMsg.content } : {}),
      maxOutputTokens: 4096,
      temperature: 0.7,
      abortSignal: signal,
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }
    return fullText
  }

  async chatStream(
    messages: ChatMessage[],
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isConfigured()) throw new Error(`${this.name} API key is not configured`)

    const client = this.getClient()
    const { sysMsg, chatMessages } = this.buildMessages(messages)
    const result = streamText({
      model: client.chat(model || this.model),
      messages: chatMessages,
      ...(sysMsg ? { system: sysMsg.content } : {}),
      maxOutputTokens: 4096,
      temperature: 0.7,
      abortSignal: signal,
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      if (signal?.aborted) break
      fullText += chunk
      onChunk(chunk)
    }
    return fullText
  }
}
