export type ProviderType = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'openai-compatible'

// A file attached to a user message. `data` is base64 for images/PDFs and
// raw text for text-like files; it is persisted with the message so later
// turns in the same thread keep the full context.
export interface ChatAttachment {
  name: string
  mediaType: string
  kind: 'image' | 'file'
  data: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: string
  model?: string
  timestamp: number
  streaming?: boolean
  error?: boolean
  attachments?: ChatAttachment[]
}

// Convert stored chat messages into AI SDK model messages. Messages without
// attachments stay plain strings; ones with attachments become multipart
// user content — text part first (with text-file contents appended as fenced
// blocks so even text-only models see them), then image/PDF parts.
export function toModelMessages(messages: ChatMessage[]): Array<{ role: string; content: any }> {
  return messages.map(m => {
    const atts = m.attachments || []
    if (atts.length === 0) return { role: m.role, content: m.content }
    let text = m.content
    const parts: any[] = []
    for (const a of atts) {
      if (a.kind === 'image') {
        parts.push({ type: 'image', image: a.data, mimeType: a.mediaType })
      } else if (a.mediaType === 'application/pdf') {
        parts.push({ type: 'file', data: a.data, mediaType: 'application/pdf' })
      } else {
        const ext = a.name.includes('.') ? a.name.split('.').pop() : ''
        text += `\n\nAttached file "${a.name}":\n\`\`\`${ext || ''}\n${a.data}\n\`\`\``
      }
    }
    parts.unshift({ type: 'text', text })
    return { role: m.role, content: parts }
  })
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
