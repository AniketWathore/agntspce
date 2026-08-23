import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CoordinatorClient } from './client'
import { registerAllTools } from './tools'
import { getWorkspaceRoot, getSocketPath, readDiscovery } from '../bootstrap'
import { randomBytes } from 'node:crypto'

function resolveSocketPath(): string {
  const envVal = process.env.AGNTSPCE_COORDINATOR_SOCKET_PATH
  if (envVal) return envVal

  const workspaceRoot = getWorkspaceRoot(process.env.AGNTSPCE_WORKSPACE_ROOT)
  if (workspaceRoot) {
    const discovery = readDiscovery(workspaceRoot)
    if (discovery) return discovery.socketPath
    return getSocketPath(workspaceRoot)
  }

  return '/tmp/agntspce-coordinator.sock'
}

const COORDINATOR_SOCKET_PATH = resolveSocketPath()
const AGENT_NAME = process.env.AGNTSPCE_AGENT_NAME || `external-${randomBytes(4).toString('hex')}`
const AGENT_TYPE = process.env.AGNTSPCE_AGENT_TYPE || 'unknown'
const AGENT_CAPABILITIES = (process.env.AGNTSPCE_AGENT_CAPABILITIES || '[]')

async function main(): Promise<void> {
  const capabilities = JSON.parse(AGENT_CAPABILITIES) as string[]

  const client = new CoordinatorClient(COORDINATOR_SOCKET_PATH)
  await client.connect()

  const registered = await client.registerAgent(AGENT_NAME, AGENT_TYPE, capabilities)
  if (!registered) {
    console.error('Failed to register with coordinator')
    process.exit(1)
  }

  const server = new McpServer({
    name: `agntspce-${AGENT_NAME}`,
    version: '1.0.0',
  })

  registerAllTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.on('SIGINT', () => {
    client.request('deregister_agent').catch(() => {})
    client.close()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    client.request('deregister_agent').catch(() => {})
    client.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Proxy error:', err)
  process.exit(1)
})
