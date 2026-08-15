import type { ProviderTemplate } from './chatTypes'

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { id: 'openai', type: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', type: 'anthropic', name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com' },
  { id: 'google', type: 'google', name: 'Google Gemini', defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'deepseek', type: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  { id: 'grok', type: 'openai-compatible', name: 'Grok (xAI)', defaultModel: 'grok-4', baseUrl: 'https://api.x.ai/v1' },
  { id: 'mistral', type: 'openai-compatible', name: 'Mistral', defaultModel: 'mistral-large-latest', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'groq', type: 'openai-compatible', name: 'Groq', defaultModel: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter', type: 'openai-compatible', name: 'OpenRouter', defaultModel: 'openai/gpt-4o', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'together', type: 'openai-compatible', name: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'custom', type: 'openai-compatible', name: 'Custom Provider', defaultModel: '', baseUrl: '', custom: true, requiresBaseUrl: true },
]

export function getProviderTemplate(id: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find(t => t.id === id)
}
