import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import type { AIProvider, ChatMessage, ProviderConfig } from '../chatTypes'

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const
  readonly name = 'Anthropic'
  readonly model = 'claude-sonnet-4-20250514'
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0
  }

  private getClient() {
    return createAnthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    })
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.isConfigured()) throw new Error('Anthropic API key is not configured')

    const client = this.getClient()
    const sysMsg = messages.filter(m => m.role === 'system').pop()
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const result = streamText({
      model: client.chat(this.model),
      messages: chatMessages,
      ...(sysMsg ? { system: sysMsg.content } : {}),
      maxTokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.7,
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }
    return fullText
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isConfigured()) throw new Error('Anthropic API key is not configured')

    const client = this.getClient()
    const sysMsg = messages.filter(m => m.role === 'system').pop()
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const result = streamText({
      model: client.chat(this.model),
      messages: chatMessages,
      ...(sysMsg ? { system: sysMsg.content } : {}),
      maxTokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.7,
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
