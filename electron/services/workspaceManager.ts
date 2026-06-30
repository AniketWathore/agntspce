import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { Workspace } from './types'

const CONFIG_DIR = path.join(os.homedir(), '.agent-workspace')

export class WorkspaceManager {
  private workspaces = new Map<string, Workspace>()
  private activeWorkspace: Workspace | null = null
  private config: any = null

  static instance: WorkspaceManager
  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager()
    }
    return WorkspaceManager.instance
  }

  async initialize() {
    await this.ensureDirectories()
    await this.loadWorkspaces()
    await this.loadConfig()
    await this.initializeActiveWorkspace()
  }

  private async ensureDirectories() {
    for (const dir of [
      CONFIG_DIR,
      path.join(CONFIG_DIR, 'workspaces'),
      path.join(CONFIG_DIR, 'deleted-workspaces'),
    ]) {
      await fs.mkdir(dir, { recursive: true })
    }
  }

  private async loadWorkspaces() {
    const wsDir = path.join(CONFIG_DIR, 'workspaces')
    let files: string[]
    try {
      files = await fs.readdir(wsDir)
    } catch { return }

    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(wsDir, file), 'utf8')
        const ws = JSON.parse(content) as Workspace
        this.workspaces.set(ws.id, ws)
      } catch (e) {
        console.error('Failed to load workspace:', file, e)
      }
    }
  }

  private async loadConfig() {
    const configFile = path.join(CONFIG_DIR, 'config.json')
    try {
      const content = await fs.readFile(configFile, 'utf8')
      this.config = JSON.parse(content)
    } catch {
      this.config = {
        version: '2.0.0',
        activeWorkspace: null,
        ui: { theme: 'dark', rememberLastWorkspace: true },
      }
      await this.saveConfig()
    }
  }

  private async saveConfig() {
    await fs.writeFile(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(this.config, null, 2))
  }

  private async initializeActiveWorkspace() {
    const remember = this.config?.ui?.rememberLastWorkspace !== false
    const configured = String(this.config?.activeWorkspace || '').trim()
    if (remember && configured && this.workspaces.has(configured)) {
      this.activeWorkspace = this.workspaces.get(configured)!
      return
    }
    if (this.workspaces.size > 0) {
      const sorted = Array.from(this.workspaces.values())
        .sort((a, b) => {
          const aTime = a.lastAccess ? new Date(a.lastAccess).getTime() : 0
          const bTime = b.lastAccess ? new Date(b.lastAccess).getTime() : 0
          return bTime - aTime
        })
      this.activeWorkspace = sorted[0]!
    }
  }

  getActiveWorkspace(): Workspace | null {
    return this.activeWorkspace
  }

  async switchWorkspace(workspaceId: string): Promise<Workspace> {
    if (!this.workspaces.has(workspaceId)) throw new Error(`Workspace not found: ${workspaceId}`)
    const ws = this.workspaces.get(workspaceId)!
    this.activeWorkspace = ws
    this.config.activeWorkspace = workspaceId
    await this.saveConfig()
    await this.updateWorkspace(workspaceId, { lastAccess: new Date().toISOString() })
    return ws
  }

  async createWorkspace(data: Workspace): Promise<Workspace> {
    if (this.workspaces.has(data.id)) throw new Error(`Workspace ID exists: ${data.id}`)
    const filePath = path.join(CONFIG_DIR, 'workspaces', `${data.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    this.workspaces.set(data.id, data)
    return data
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<Workspace> {
    if (!this.workspaces.has(workspaceId)) throw new Error(`Workspace not found: ${workspaceId}`)
    const updated = { ...this.workspaces.get(workspaceId)!, ...updates }
    const filePath = path.join(CONFIG_DIR, 'workspaces', `${workspaceId}.json`)
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2))
    this.workspaces.set(workspaceId, updated)
    if (this.activeWorkspace?.id === workspaceId) this.activeWorkspace = updated
    return updated
  }

  async deleteWorkspace(workspaceId: string) {
    if (!this.workspaces.has(workspaceId)) throw new Error(`Workspace not found: ${workspaceId}`)
    const ws = this.workspaces.get(workspaceId)!
    const filePath = path.join(CONFIG_DIR, 'workspaces', `${workspaceId}.json`)
    await fs.writeFile(
      path.join(CONFIG_DIR, 'deleted-workspaces', `${workspaceId}-${Date.now()}.json`),
      JSON.stringify({ deletedAt: new Date().toISOString(), workspace: ws }, null, 2)
    )
    await fs.unlink(filePath)
    this.workspaces.delete(workspaceId)
    if (this.activeWorkspace?.id === workspaceId) this.activeWorkspace = null
  }

  listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values())
      .sort((a, b) => {
        const aTime = a.lastAccess ? new Date(a.lastAccess).getTime() : 0
        const bTime = b.lastAccess ? new Date(b.lastAccess).getTime() : 0
        return bTime - aTime
      })
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id)
  }

  getConfig() { return this.config }
}
