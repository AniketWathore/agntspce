const IMG_BASE = '/img'

const AGENT_IMAGE_MAP: Record<string, { text: string; color: string }> = {
  claude: { text: 'claudecode-text.png', color: 'claudecode-color.png' },
  codex: { text: 'codex-text.png', color: 'codex-color.png' },
  opencode: { text: 'opencode-text.png', color: 'opencode-color.png' },
  gemini: { text: 'geminicli-text.png', color: 'geminicli-color.png' },
}

export function getAgentTextImage(type: string): string {
  return `${IMG_BASE}/${AGENT_IMAGE_MAP[type]?.text || 'codex-text.png'}`
}

export function getAgentColorImage(type: string): string {
  return `${IMG_BASE}/${AGENT_IMAGE_MAP[type]?.color || 'codex-color.png'}`
}
