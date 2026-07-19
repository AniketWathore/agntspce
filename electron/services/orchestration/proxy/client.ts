import * as net from 'node:net'

export interface RpcError {
  code: string
  message: string
  data?: unknown
}

export interface RpcResult {
  result?: unknown
  error?: RpcError
  pendingMessages: unknown[]
}

export class CoordinatorClient {
  private socket: net.Socket | null = null
  private buffer = ''
  private pending = new Map<string, { resolve: (value: RpcResult) => void; reject: (err: Error) => void }>()
  private requestId = 0
  private connected = false
  private connectResolve: (() => void) | null = null
  private connectReject: ((err: Error) => void) | null = null
  private socketPath: string

  constructor(socketPath: string) {
    this.socketPath = socketPath
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket()
      this.connectResolve = resolve
      this.connectReject = reject

      socket.on('connect', () => {
        this.connected = true
        if (this.connectResolve) {
          this.connectResolve()
          this.connectResolve = null
          this.connectReject = null
        }
      })

      socket.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString()
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            this.handleMessage(msg)
          } catch {}
        }
      })

      socket.on('error', (err) => {
        if (this.connectReject) {
          this.connectReject(err)
          this.connectResolve = null
          this.connectReject = null
        }
      })

      socket.on('close', () => {
        this.connected = false
        for (const [id, { reject }] of this.pending) {
          reject(new Error('Connection closed'))
          this.pending.delete(id)
        }
      })

      socket.connect(this.socketPath)
      this.socket = socket
    })
  }

  private handleMessage(msg: { id: string; result?: unknown; error?: RpcError; pendingMessages?: unknown[] }): void {
    const pending = this.pending.get(msg.id)
    if (pending) {
      this.pending.delete(msg.id)
      pending.resolve({
        result: msg.result,
        error: msg.error,
        pendingMessages: msg.pendingMessages || [],
      })
    }
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<RpcResult> {
    if (!this.socket || !this.connected) {
      return { error: { code: 'NOT_CONNECTED', message: 'Not connected to coordinator' }, pendingMessages: [] }
    }

    const id = String(++this.requestId)
    return new Promise<RpcResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const request = JSON.stringify({ id, method, params }) + '\n'
      try {
        this.socket!.write(request)
      } catch (e) {
        this.pending.delete(id)
        reject(e as Error)
      }
    })
  }

  async registerAgent(name: string, agentType: string, capabilities: string[] = []): Promise<{ agentId: string } | null> {
    const result = await this.request('register_agent', { name, agentType, capabilities })
    if (result.error) {
      console.error('Failed to register agent:', result.error.message)
      return null
    }
    return result.result as { agentId: string }
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
      this.connected = false
    }
  }
}
