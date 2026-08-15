export type ProviderType = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'openai-compatible'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: string
  model?: string
  timestamp: number
  streaming?: boolean
  error?: boolean
}

export interface ChatThread {
  id: string
  title: string
  providerId: string
  model: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ApiKeyEntry {
  id: string
  type: ProviderType
  name: string
  model: string
  apiKey: string
  baseUrl?: string
  expiresAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface ProviderTemplate {
  id: string
  type: ProviderType
  name: string
  defaultModel: string
  baseUrl?: string
  custom?: boolean
  requiresBaseUrl?: boolean
}

export interface KeySummary {
  id: string
  type: ProviderType
  name: string
  model: string
  baseUrl?: string
  hasKey: boolean
  maskedKey?: string
  expiresAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface ChatModelInfo {
  id: string
  type: ProviderType
  name: string
  model: string
  baseUrl?: string
  hasKey: boolean
  configured: boolean
}

export interface AIProvider {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly baseUrl?: string
  isConfigured(): boolean
  listModels(): Promise<string[]>
  chat(messages: ChatMessage[], model: string, signal?: AbortSignal): Promise<string>
  chatStream(
    messages: ChatMessage[],
    model: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string>
}

export interface StreamChunk {
  threadId: string
  content: string
  done: boolean
  error?: string
}
