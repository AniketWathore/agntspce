import { assetUrl } from './utils/assetUrl'

const AGENT_IMAGE_MAP: Record<string, { text: string; color: string }> = {
  claude: { text: 'claudecode-text.png', color: 'claudecode-color.png' },
  codex: { text: 'codex-text.png', color: 'codex-color.png' },
  opencode: { text: 'opencode-text.png', color: 'opencode-color.png' },
  gemini: { text: 'geminicli-text.png', color: 'geminicli-color.png' },
  cursor: { text: 'cursor-text.svg', color: 'cursor-color.svg' },
  copilot: { text: 'copilot-text.svg', color: 'copilot-color.svg' },
  mastra: { text: 'mastra-text.svg', color: 'mastra-color.svg' },
  droid: { text: 'droid-text.svg', color: 'droid-color.svg' },
  amp: { text: 'amp-text.svg', color: 'amp-color.svg' },
  pi: { text: 'pi-text.svg', color: 'pi-color.png' },
  kilocode: { text: 'kilocode-color.png', color: 'kilocode-color.png' },
  windsurf: { text: 'windsurf-color.png', color: 'windsurf-color.png' },
}

export function getAgentTextImage(type: string): string {
  return assetUrl(`/img/${AGENT_IMAGE_MAP[type]?.text || 'codex-text.png'}`)
}

export function getAgentColorImage(type: string): string {
  return assetUrl(`/img/${AGENT_IMAGE_MAP[type]?.color || 'codex-color.png'}`)
}
