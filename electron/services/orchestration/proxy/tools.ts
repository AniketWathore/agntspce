import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CoordinatorClient } from './client'

function errorText(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; message?: string }
    return e.message || e.code || String(err)
  }
  return String(err)
}

export function registerAllTools(server: McpServer, client: CoordinatorClient): void {
  server.tool(
    'get_workspace_context',
    'Get the current workspace context: active agents, tasks, open escalations',
    {},
    async () => {
      const res = await client.request('get_workspace_context')
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'create_task',
    'Declare a task with a description and list of files you intend to modify',
    {
      description: z.string().min(1).max(2000).describe('Description of the task'),
      declaredFiles: z.array(z.string()).min(1).describe('Files you intend to modify'),
    },
    async (args: { description: string; declaredFiles: string[] }) => {
      const res = await client.request('create_task', {
        description: args.description,
        declaredFiles: args.declaredFiles,
      })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      const r = res.result as { task?: Record<string, unknown>; overlapWarning?: { conflictingFiles: string[]; conflictingTaskIds: string[] } } | undefined
      let text = JSON.stringify(r?.task, null, 2)
      if (r?.overlapWarning) {
        text += `\n\n⚠️ Overlap warning: files ${r.overlapWarning.conflictingFiles.join(', ')} are also claimed by tasks ${r.overlapWarning.conflictingTaskIds.join(', ')}. This is non-fatal now, but claim will be rejected if these files are still active.`
      }
      return {
        content: [{ type: 'text', text }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'list_tasks',
    'List all tasks with their statuses',
    {},
    async () => {
      const res = await client.request('list_tasks')
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      const tasks = (res.result as { tasks: unknown[] })?.tasks || []
      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks found.' }], _meta: { pendingMessages: res.pendingMessages } }
      }
      const lines = tasks.map((t: any, i: number) =>
        `${i + 1}. [${t.status}] ${t.description}${t.agentId ? ` (assigned: ${t.agentId})` : ''}`
      )
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'claim_task',
    'Claim an open task. The coordinator creates an isolated git worktree and branch for you.',
    {
      taskId: z.string().describe('ID of the task to claim'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('claim_task', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'post_status',
    'Post a short status update for your current task',
    {
      taskId: z.string().describe('ID of the task'),
      statusText: z.string().min(1).max(500).describe('Short status text'),
    },
    async (args: { taskId: string; statusText: string }) => {
      const res = await client.request('post_status', { taskId: args.taskId, statusText: args.statusText })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: 'Status updated.' }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'mark_task_done',
    'Signal that your task work is complete. The coordinator will run the merge gate.',
    {
      taskId: z.string().describe('ID of the task to mark done'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('mark_task_done', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: `Task ${args.taskId} submitted for merge gate processing.` }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'retry_task_setup',
    'Retry dependency installation for a task that is in setup_failed status',
    {
      taskId: z.string().describe('ID of the task to retry setup for'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('retry_task_setup', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      const r = res.result as { ok?: boolean; setupError?: string } | undefined
      if (r?.ok === false) {
        return { content: [{ type: 'text', text: `Setup retry failed: ${r.setupError}` }], isError: true }
      }
      return {
        content: [{ type: 'text', text: 'Setup retry succeeded. Task is now in_progress.' }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'abandon_task',
    'Abandon a task you own. Keeps the worktree on disk for review.',
    {
      taskId: z.string().describe('ID of the task to abandon'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('abandon_task', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: `Task ${args.taskId} abandoned. Worktree kept for review.` }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'send_message',
    'Send an async message to another agent or broadcast to all agents',
    {
      content: z.string().min(1).max(10000).describe('Message content'),
      toAgentId: z.string().optional().describe('Target agent ID (omit for broadcast)'),
      broadcast: z.boolean().optional().describe('Send to all active agents'),
    },
    async (args: { content: string; toAgentId?: string; broadcast?: boolean }) => {
      if (!args.toAgentId && !args.broadcast) {
        return {
          content: [{ type: 'text', text: 'Specify either toAgentId or set broadcast: true' }],
          isError: true,
        }
      }
      const res = await client.request('send_message', {
        content: args.content,
        toAgentId: args.toAgentId || null,
        broadcast: args.broadcast || false,
      })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: 'Message sent.' }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'check_messages',
    'Check for unread messages from other agents',
    {},
    async () => {
      const res = await client.request('check_messages')
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      const messages = (res.result as { messages: unknown[] })?.messages || []
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No unread messages.' }], _meta: { pendingMessages: res.pendingMessages } }
      }
      const lines = messages.map((m: any) =>
        `[${new Date(m.createdAt).toISOString()}] from ${m.fromAgentId}: ${m.content}`
      )
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'check_merge_status',
    'Check whether a task is ready to be merged (worktree clean, status is merging)',
    {
      taskId: z.string().describe('ID of the task to check'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('check_merge_status', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'merge_branch',
    'Execute the merge gate: build+test then fast-forward merge the task branch into main',
    {
      taskId: z.string().describe('ID of the task to merge'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('merge_branch', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'escalate_to_human',
    'Escalate an issue to a human. Involved agents will be paused.',
    {
      reason: z.string().min(1).max(2000).describe('Reason for escalation'),
      details: z.string().max(10000).optional().describe('Additional details'),
      involvedAgentIds: z.array(z.string()).optional().describe('Agent IDs to pause (defaults to just you)'),
    },
    async (args: { reason: string; details?: string; involvedAgentIds?: string[] }) => {
      const res = await client.request('escalate_to_human', {
        reason: args.reason,
        details: args.details || '',
        involvedAgentIds: args.involvedAgentIds || [],
      })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'get_task_summary',
    'Get a concise summary of a task (status, branch, key files, last update)',
    {
      taskId: z.string().describe('ID of the task to summarize'),
    },
    async (args: { taskId: string }) => {
      const res = await client.request('get_task_summary', { taskId: args.taskId })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )

  server.tool(
    'get_agent_summary',
    'Get a concise summary of an agent: active tasks and recent completed task summaries',
    {
      agentId: z.string().optional().describe('Agent ID (defaults to calling agent)'),
    },
    async (args: { agentId?: string }) => {
      const res = await client.request('get_agent_summary', { agentId: args.agentId || null })
      if (res.error) return { content: [{ type: 'text', text: `Error: ${errorText(res.error)}` }], isError: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(res.result, null, 2) }],
        _meta: { pendingMessages: res.pendingMessages },
      }
    },
  )
}
