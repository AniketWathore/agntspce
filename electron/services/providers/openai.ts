import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import type { AIProvider, ChatMessage, ProviderConfig } from './chatTypes'

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const
  readonly name = 'OpenAI'
  readonly model = 'gpt-4o'
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0
  }

  private getClient() {
    return createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    })
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.isConfigured()) throw new Error('OpenAI API key is not configured')

    const client = this.getClient()
    const result = await streamText({
      model: client.chat(this.model),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
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
    if (!this.isConfigured()) throw new Error('OpenAI API key is not configured')

    const client = this.getClient()
    const result = streamText({
      model: client.chat(this.model),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
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
