// Single source of truth for agent-capable session types in the renderer.
// Keep in sync with SessionState['type'] in src/types/index.ts and the
// backend's agentManager.ts.
export const ALL_AGENT_TYPES = [
  'claude',
  'codex',
  'opencode',
  'gemini',
  'cursor-agent',
  'copilot',
  'mastracode',
  'droid',
  'amp',
  'pi',
  'kilocode',
  'windsurf',
] as const

export type AgentTypeId = (typeof ALL_AGENT_TYPES)[number]

export const AGENT_TYPE_SET = new Set<string>(ALL_AGENT_TYPES)

export function isAgentTypeId(type: string): boolean {
  return AGENT_TYPE_SET.has(type)
}
