export type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: ProviderId
  model?: string
  timestamp: number
  streaming?: boolean
  error?: boolean
}

export interface ChatThread {
  id: string
  providerId: ProviderId
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ProviderConfig {
  id: ProviderId
  name: string
  model: string
  apiKey: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
}

export interface AIProvider {
  readonly id: ProviderId
  readonly name: string
  readonly model: string
  isConfigured(): boolean
  chat(messages: ChatMessage[]): Promise<string>
  chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>
}

export interface ChatRequest {
  providerId: ProviderId
  messages: ChatMessage[]
  threadId: string
}

export interface ChatResponse {
  success: boolean
  message?: ChatMessage
  error?: string
}

export interface StreamChunk {
  threadId: string
  content: string
  done: boolean
  error?: string
}
