import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import type { AIProvider, ApiKeyEntry, ChatMessage } from '../chatTypes'

const GEMINI_API = 'https://generativelanguage.googleapis.com'

export class GeminiProvider implements AIProvider {
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
    return createGoogleGenerativeAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl || undefined,
    })
  }

  async listModels(): Promise<string[]> {
    if (!this.isConfigured()) return []
    try {
      const base = (this.baseUrl || GEMINI_API).replace(/\/$/, '')
      const res = await fetch(`${base}/v1beta/models?key=${encodeURIComponent(this.apiKey)}`)
      if (!res.ok) return []
      const data = await res.json()
      const models = data?.models?.map((m: any) => m.name?.replace(/^models\//, '')).filter(Boolean)
      return Array.isArray(models) ? models : []
    } catch {
      return []
    }
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isConfigured()) throw new Error(`${this.name} API key is not configured`)

    const client = this.getClient()
    let streamError: unknown = null
    const result = streamText({
      model: client.chat(model || this.model),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      maxOutputTokens: 4096,
      temperature: 0.7,
      abortSignal: signal,
      // Replaces the SDK default that dumps the whole APICallError object
      // (incl. message contents) to stdout. The error is rethrown below.
      onError: ({ error }) => { streamError = error },
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }
    if (streamError != null) {
      throw streamError instanceof Error ? streamError : new Error(String(streamError))
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
    let streamError: unknown = null
    const result = streamText({
      model: client.chat(model || this.model),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      maxOutputTokens: 4096,
      temperature: 0.7,
      abortSignal: signal,
      onError: ({ error }) => { streamError = error },
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      if (signal?.aborted) break
      fullText += chunk
      onChunk(chunk)
    }
    if (streamError != null && !signal?.aborted) {
      throw streamError instanceof Error ? streamError : new Error(String(streamError))
    }
    return fullText
  }
}
