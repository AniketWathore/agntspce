export interface AgentFlag {
  flag: string
  description: string
  label: string
  category: string
  default: boolean
}

export interface AgentMode {
  command: string
  description: string
}

export interface AgentConfig {
  id: string
  name: string
  icon: string
  description: string
  baseCommand: string
  modes: Record<string, AgentMode>
  flags: Record<string, AgentFlag>
  defaultMode: string
  defaultFlags: string[]
  availableFlags: string[]
  flagCategories: Record<string, { name: string, mutuallyExclusive: boolean }>
  models?: string[]
  defaultModel?: string
  reasoningLevels?: string[]
  defaultReasoning?: string
  verbosityLevels?: string[]
  defaultVerbosity?: string
}

export interface AgentUIConfig {
  id: string
  name: string
  icon: string
  description: string
  modes: { id: string, name: string, description: string }[]
  flags: ({ id: string } & AgentFlag)[]
  defaultMode: string
  models?: string[]
  defaultModel?: string
  reasoningLevels?: string[]
  defaultReasoning?: string
  verbosityLevels?: string[]
  defaultVerbosity?: string
}

export interface AgentStartConfig {
  agentId: string
  mode: string
  flags: string[]
  model?: string
  reasoning?: string
  verbosity?: string
  resumeId?: string
}

export class AgentManager {
  private agentConfigs = new Map<string, AgentConfig>()

  constructor() {
    this.initializeAgents()
  }

  private initializeAgents() {
    this.agentConfigs.set('claude', {
      id: 'claude',
      name: 'Claude',
      icon: '🤖',
      description: 'Anthropic Claude Code',
      baseCommand: 'claude',
      modes: {
        fresh: { command: 'claude', description: 'Start new session' },
        continue: { command: 'claude --continue', description: 'Resume conversation' },
        resume: { command: 'claude --resume', description: 'Restore interrupted session' },
      },
      flags: {
        skipPermissions: {
          flag: '--dangerously-skip-permissions',
          description: 'YOLO Mode (skip permissions)',
          label: '🚀 YOLO Mode',
          category: 'permissions',
          default: true,
        },
        verbose: {
          flag: '--verbose',
          description: 'Verbose output mode',
          label: '📝 Verbose',
          category: 'output',
          default: false,
        },
        debug: {
          flag: '--debug',
          description: 'Debug mode with detailed logging',
          label: '🐛 Debug',
          category: 'output',
          default: false,
        },
      },
      defaultMode: 'fresh',
      defaultFlags: ['skipPermissions'],
      availableFlags: ['skipPermissions', 'verbose', 'debug'],
      flagCategories: {
        permissions: { name: 'Permissions', mutuallyExclusive: false },
        output: { name: 'Output Options', mutuallyExclusive: false },
      },
    })

    this.agentConfigs.set('opencode', {
      id: 'opencode',
      name: 'Opencode',
      icon: '🔧',
      description: 'AI-powered coding agent CLI',
      baseCommand: 'opencode',
      modes: {
        fresh: { command: 'opencode', description: 'Start new session' },
        continue: { command: 'opencode --continue', description: 'Continue last session' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('gemini', {
      id: 'gemini',
      name: 'Gemini',
      icon: '✨',
      description: 'Google Gemini CLI',
      baseCommand: 'gemini',
      modes: {
        fresh: { command: 'gemini', description: 'Start new session' },
      },
      models: ['gemini-2.5-pro', 'gemini-2.0-flash'],
      defaultModel: 'gemini-2.5-pro',
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('codex', {
      id: 'codex',
      name: 'Codex',
      icon: '⚡',
      description: 'OpenAI Codex CLI',
      baseCommand: 'codex',
      modes: {
        fresh: { command: 'codex', description: 'Start new session' },
        continue: { command: 'codex resume --last', description: 'Continue most recent session' },
        resume: { command: 'codex resume', description: 'Resume interrupted session' },
      },
      models: ['gpt-4', 'gpt-5', 'gpt-5-codex'],
      defaultModel: 'gpt-5-codex',
      reasoningLevels: ['low', 'medium', 'high'],
      defaultReasoning: 'high',
      verbosityLevels: ['low', 'medium', 'high'],
      defaultVerbosity: 'high',
      flags: {
        yolo: {
          flag: '--dangerously-bypass-approvals-and-sandbox',
          description: 'No approvals + no sandboxing (extremely dangerous)',
          label: '🚀 YOLO Mode',
          category: 'sandbox',
          default: true,
        },
        workspaceWrite: {
          flag: '--sandbox workspace-write',
          description: 'Write files in workspace only (safer than YOLO)',
          label: '📝 Workspace Write',
          category: 'sandbox',
          default: false,
        },
        readOnly: {
          flag: '--sandbox read-only',
          description: 'Read-only access (safest, no modifications)',
          label: '👀 Read Only',
          category: 'sandbox',
          default: false,
        },
        neverAsk: {
          flag: '--ask-for-approval never',
          description: 'Never ask for permission',
          label: '⚡ Never Ask',
          category: 'approvals',
          default: false,
        },
        askOnRequest: {
          flag: '--ask-for-approval on-request',
          description: 'Ask only on risky operations',
          label: '🛡️ Ask on Risk',
          category: 'approvals',
          default: false,
        },
      },
      defaultMode: 'fresh',
      defaultFlags: ['yolo'],
      availableFlags: ['yolo', 'workspaceWrite', 'readOnly', 'neverAsk', 'askOnRequest'],
      flagCategories: {
        sandbox: { name: 'Sandbox Mode', mutuallyExclusive: true },
        approvals: { name: 'Approval Policy', mutuallyExclusive: true },
      },
    })

    this.agentConfigs.set('cursor-agent', {
      id: 'cursor-agent',
      name: 'Cursor Agent',
      icon: '🖥️',
      description: 'Cursor AI coding agent',
      baseCommand: 'cursor-agent',
      modes: {
        fresh: { command: 'cursor-agent', description: 'Start new session' },
        continue: { command: 'cursor-agent --continue', description: 'Continue last session' },
      },
      models: ['claude-sonnet-4', 'claude-3.5-sonnet', 'gpt-4', 'gpt-5'],
      defaultModel: 'claude-sonnet-4',
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('copilot', {
      id: 'copilot',
      name: 'Copilot',
      icon: '🐙',
      description: 'GitHub Copilot CLI',
      baseCommand: 'gh copilot',
      modes: {
        fresh: { command: 'gh copilot', description: 'Start new session' },
        explain: { command: 'gh copilot explain', description: 'Explain code' },
        suggest: { command: 'gh copilot suggest', description: 'Suggest code' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('mastracode', {
      id: 'mastracode',
      name: 'Mastra Code',
      icon: '🔷',
      description: 'Mastra Code AI agent',
      baseCommand: 'mastra',
      modes: {
        fresh: { command: 'mastra', description: 'Start new session' },
        continue: { command: 'mastra --continue', description: 'Continue last session' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('droid', {
      id: 'droid',
      name: 'Droid',
      icon: '🤖',
      description: 'Factory AI Droid coding agent',
      baseCommand: 'droid',
      modes: {
        fresh: { command: 'droid', description: 'Start new session' },
        continue: { command: 'droid --continue', description: 'Continue last session' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('amp', {
      id: 'amp',
      name: 'Amp',
      icon: '⚡',
      description: 'Amplified Amp coding agent',
      baseCommand: 'amp',
      modes: {
        fresh: { command: 'amp', description: 'Start new session' },
        agent: { command: 'amp agent', description: 'Run in agent mode' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })

    this.agentConfigs.set('pi', {
      id: 'pi',
      name: 'Pi',
      icon: '🥧',
      description: 'Pi coding agent',
      baseCommand: 'pi',
      modes: {
        fresh: { command: 'pi', description: 'Start new session' },
        continue: { command: 'pi --continue', description: 'Continue last session' },
      },
      flags: {},
      defaultMode: 'fresh',
      defaultFlags: [],
      availableFlags: [],
      flagCategories: {},
    })
  }

  getAllAgents(): AgentConfig[] {
    return Array.from(this.agentConfigs.values())
  }

  getAgent(agentId: string): AgentConfig | undefined {
    return this.agentConfigs.get(agentId)
  }

  getUIConfig(agentId: string): AgentUIConfig | null {
    const agent = this.agentConfigs.get(agentId)
    if (!agent) return null

    return {
      id: agent.id,
      name: agent.name,
      icon: agent.icon,
      description: agent.description,
      modes: Object.entries(agent.modes).map(([key, mode]) => ({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        description: mode.description,
      })),
      flags: (agent.availableFlags || []).map(flagId => ({
        id: flagId,
        ...agent.flags[flagId],
      })),
      defaultMode: agent.defaultMode,
      models: agent.models,
      defaultModel: agent.defaultModel,
      reasoningLevels: agent.reasoningLevels,
      defaultReasoning: agent.defaultReasoning,
      verbosityLevels: agent.verbosityLevels,
      defaultVerbosity: agent.defaultVerbosity,
    }
  }

  buildCommand(agentId: string, mode: string, configOrFlags: AgentStartConfig | string[] = []): string {
    const agent = this.agentConfigs.get(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)

    const modeConfig = agent.modes[mode]
    if (!modeConfig) throw new Error(`Unknown mode '${mode}' for agent '${agentId}'`)

    let command = modeConfig.command

    if (typeof configOrFlags === 'object' && !Array.isArray(configOrFlags)) {
      const config = configOrFlags as AgentStartConfig

      if (mode === 'resume' && config.resumeId) {
        if (agentId === 'claude') {
          command = `${modeConfig.command} ${config.resumeId}`
        }
      }

      if (config.model && agent.models) {
        command += ` -m ${config.model}`
      }
      if (config.reasoning) {
        command += ` -c model_reasoning_effort="${config.reasoning}"`
      }
      if (config.verbosity) {
        command += ` -c model_verbosity="${config.verbosity}"`
      }

      const enabledFlags = config.flags || []
      enabledFlags.forEach(flagId => {
        const flag = agent.flags[flagId]
        if (flag) command += ` ${flag.flag}`
      })

      if (agentId === 'codex' && mode === 'resume' && config.resumeId) {
        command += ` ${config.resumeId}`
      }
    } else {
      const enabledFlags = Array.isArray(configOrFlags) ? configOrFlags : []
      enabledFlags.forEach(flagId => {
        const flag = agent.flags[flagId]
        if (flag) command += ` ${flag.flag}`
      })
    }

    return command
  }

  getDefaultConfig(agentId: string): AgentStartConfig | null {
    const agent = this.agentConfigs.get(agentId)
    if (!agent) return null
    return { agentId, mode: agent.defaultMode, flags: agent.defaultFlags || [] }
  }

  getPowerfulConfig(agentId: string): AgentStartConfig | null {
    const agent = this.agentConfigs.get(agentId)
    if (!agent) return null
    if (agent.defaultFlags && agent.defaultFlags.length > 0) {
      return { agentId, mode: agent.defaultMode, flags: [...agent.defaultFlags] }
    }
    const powerfulFlags = Object.entries(agent.flags)
      .filter(([, c]) => c.category === 'sandbox' || c.category === 'permissions')
      .map(([flagId]) => flagId)
    return { agentId, mode: agent.defaultMode, flags: powerfulFlags }
  }

  validateAndAdjustFlags(agentId: string, flags: string[]): string[] {
    const agent = this.agentConfigs.get(agentId)
    if (!agent) return flags

    const adjusted = [...flags]
    const categories = agent.flagCategories || {}

    for (const [categoryId, categoryConfig] of Object.entries(categories)) {
      if (categoryConfig.mutuallyExclusive) {
        const categoryFlags = adjusted.filter(flagId => {
          const flag = agent.flags[flagId]
          return flag && flag.category === categoryId
        })
        if (categoryFlags.length > 1) {
          const lastFlag = categoryFlags[categoryFlags.length - 1]
          categoryFlags.slice(0, -1).forEach(flagId => {
            const index = adjusted.indexOf(flagId)
            if (index > -1) adjusted.splice(index, 1)
          })
        }
      }
    }

    return adjusted
  }

  validateConfig(config: AgentStartConfig): { valid: boolean, error?: string } {
    const { agentId, mode, flags = [] } = config
    const agent = this.agentConfigs.get(agentId)
    if (!agent) return { valid: false, error: `Unknown agent: ${agentId}` }
    if (!agent.modes[mode]) return { valid: false, error: `Unknown mode '${mode}' for agent '${agentId}'` }
    const invalidFlags = flags.filter(f => !agent.flags[f])
    if (invalidFlags.length > 0) {
      return { valid: false, error: `Unknown flags for agent '${agentId}': ${invalidFlags.join(', ')}` }
    }
    return { valid: true }
  }
}
