export { StateManager, CoordinatorError } from './stateManager'
export type {
  AgentInfo,
  TaskOverview,
  MessageInfo,
  EscalationInfo,
  StatusUpdateInfo,
  WorkspaceContextResult,
} from './stateManager'

export { Coordinator } from './coordinator'
export type { RpcRequest, RpcResponse, ProxySession } from './coordinator'

export { CoordinatorClient } from './proxy/client'
export type { RpcResult } from './proxy/client'

export { registerAllTools } from './proxy/tools'
