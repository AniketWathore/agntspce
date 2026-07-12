import { spawn, ChildProcess, execSync } from 'child_process'
import { EventEmitter } from 'events'
import { RAW_CAP } from './constants'

export interface StreamFilter {
  feedLine(line: string): string | null
  flush(): string
  onExit?(exitCode: number, raw: string): string | null
}

export interface BlockHandler {
  shouldSkip(line: string): boolean
  isBlockStart(line: string): boolean
  isBlockContinuation(line: string, block: string[]): boolean
  formatSummary(exitCode: number, raw: string): string | null
}

export class BlockStreamFilter implements StreamFilter {
  private handler: BlockHandler
  private inBlock = false
  private currentBlock: string[] = []
  private blocksEmitted = 0

  constructor(handler: BlockHandler) {
    this.handler = handler
  }

  private emitBlock(): string | null {
    if (this.currentBlock.length === 0) return null
    const block = this.currentBlock.join('\n')
    this.currentBlock = []
    this.blocksEmitted++
    return `${block}\n`
  }

  feedLine(line: string): string | null {
    if (this.handler.shouldSkip(line)) return null
    if (this.handler.isBlockStart(line)) {
      const prev = this.emitBlock()
      this.currentBlock.push(line)
      this.inBlock = true
      return prev
    } else if (this.inBlock) {
      if (this.handler.isBlockContinuation(line, this.currentBlock)) {
        this.currentBlock.push(line)
        return null
      } else {
        this.inBlock = false
        return this.emitBlock()
      }
    }
    return null
  }

  flush(): string {
    return this.emitBlock() || ''
  }

  onExit(exitCode: number, raw: string): string | null {
    return this.handler.formatSummary(exitCode, raw)
  }
}

export interface LineHandler {
  shouldSkip?(line: string): boolean
  observeLine?(line: string): void
  formatSummary(exitCode: number, raw: string): string | null
}

export class LineStreamFilter implements StreamFilter {
  private handler: LineHandler

  constructor(handler: LineHandler) {
    this.handler = handler
  }

  feedLine(line: string): string | null {
    if (this.handler.shouldSkip?.(line)) return null
    this.handler.observeLine?.(line)
    return `${line}\n`
  }

  flush(): string {
    return ''
  }

  onExit(exitCode: number, raw: string): string | null {
    return this.handler.formatSummary(exitCode, raw)
  }
}

export interface CaptureResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface StreamResult {
  exitCode: number
  raw: string
  rawStdout: string
  rawStderr: string
  filtered: string
}

export type FilterMode = 'streaming' | 'buffered' | 'capture' | 'passthrough'

export interface RunStreamingOptions {
  stdinMode?: 'inherit' | 'null'
  filterMode?: FilterMode
  streamFilter?: StreamFilter
  bufferFilter?: (text: string) => string
}

export function execCapture(cmd: string, args: string[], cwd?: string): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let capped = false

    child.stdout!.on('data', (data: Buffer) => {
      if (stdout.length < RAW_CAP) {
        stdout += data.toString('utf-8')
        if (stdout.length > RAW_CAP) {
          stdout = stdout.slice(0, RAW_CAP)
          capped = true
        }
      }
    })

    child.stderr!.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8')
    })

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      })
    })

    child.on('error', reject)
  })
}

export function runStreaming(
  cmd: string,
  args: string[],
  options: RunStreamingOptions = {},
  cwd?: string,
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const { stdinMode = 'null', filterMode = 'capture', streamFilter, bufferFilter } = options

    if (filterMode === 'passthrough') {
      const child = spawn(cmd, args, {
        cwd,
        stdio: stdinMode === 'inherit' ? 'inherit' : ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      })
      child.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          raw: '',
          rawStdout: '',
          rawStderr: '',
          filtered: '',
        })
      })
      child.on('error', reject)
      return
    }

    const stdio: ('ignore' | 'pipe')[] = stdinMode === 'inherit' ? ['inherit', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
    const child = spawn(cmd, args, { cwd, stdio: stdio as any, windowsHide: true })

    let rawStdout = ''
    let rawStderr = ''
    let filtered = ''
    let cappedOut = false
    let cappedErr = false

    if (filterMode === 'streaming' && streamFilter) {
      child.stdout!.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        if (!cappedOut) {
          if (rawStdout.length + chunk.length < RAW_CAP) {
            rawStdout += chunk
          } else {
            cappedOut = true
          }
        }
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line) {
            const result = streamFilter.feedLine(line)
            if (result) filtered += result
          }
        }
      })

      child.stderr!.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        if (!cappedErr) {
          if (rawStderr.length + chunk.length < RAW_CAP) {
            rawStderr += chunk
          } else {
            cappedErr = true
          }
        }
      })
    } else {
      child.stdout!.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        if (!cappedOut) {
          if (rawStdout.length + chunk.length < RAW_CAP) {
            rawStdout += chunk
          } else {
            cappedOut = true
          }
        }
      })

      child.stderr!.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        if (!cappedErr) {
          if (rawStderr.length + chunk.length < RAW_CAP) {
            rawStderr += chunk
          } else {
            cappedErr = true
          }
        }
      })
    }

    child.on('close', (code) => {
      const exitCode = code ?? 1
      const raw = rawStdout + rawStderr

      if (filterMode === 'buffered' && bufferFilter) {
        filtered = bufferFilter(rawStdout)
      } else if (filterMode === 'capture') {
        filtered = rawStdout
      } else if (filterMode === 'streaming' && streamFilter) {
        const tail = streamFilter.flush()
        filtered += tail
        if (streamFilter.onExit) {
          const post = streamFilter.onExit(exitCode, raw)
          if (post) filtered += post
        }
      }

      resolve({
        exitCode,
        raw,
        rawStdout,
        rawStderr,
        filtered,
      })
    })

    child.on('error', reject)
  })
}

export function runCommandSync(cmd: string, args: string[], cwd?: string): CaptureResult {
  try {
    const result = execSync(`"${cmd}" ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: RAW_CAP,
      windowsHide: true,
    })
    return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: 0 }
  } catch (e: any) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || e.message || '',
      exitCode: e.status ?? 1,
    }
  }
}
