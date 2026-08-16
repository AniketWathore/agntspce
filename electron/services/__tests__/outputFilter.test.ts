import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { OutputFilterService } from '../outputFilter'

describe('OutputFilterService', () => {
  let filter: OutputFilterService
  let emitted: any[]

  beforeEach(() => {
    vi.useFakeTimers()
    filter = new OutputFilterService()
    emitted = []
    filter.setOnCommandEvent(e => emitted.push(e))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Drive a full command lifecycle: marker → output → prompt, then advance the
  // finalize timer (1.5s) so the real code path emits the CommandEvent.
  function runCommand(lines: string[], sessionId = 's1'): any {
    for (const line of lines) filter.processOutput(sessionId, line)
    vi.advanceTimersByTime(2000)
    return emitted[emitted.length - 1] ?? null
  }

  describe('processOutput passthrough', () => {
    it('returns data unmodified (VT stream integrity)', () => {
      const data = '\x1b[31mred\x1b[0m\r\nline two\r\n'
      expect(filter.processOutput('s1', data)).toBe(data)
    })

    it('handles empty data', () => {
      expect(filter.processOutput('s1', '')).toBe('')
    })
  })

  describe('system line display stripping', () => {
    it('strips wrapper marker from display but still detects the command', () => {
      const markerLine = 'agntspce $ git status\r\n'
      const display = filter.processOutput('s1', markerLine)
      expect(display).not.toContain('agntspce $ git status')
      // Detection must still fire (marker consumed for RTK tracking)
      filter.processOutput('s1', ' M src/App.tsx\r\n')
      filter.processOutput('s1', '$ \r\n')
      vi.advanceTimersByTime(2000)
      expect(emitted[emitted.length - 1]?.command).toBe('git')
    })

    it('strips AGNTSPCE_STATS and [agntspce] diag lines from display', () => {
      const statsLine = '\x1b[2K\rAGNTSPCE_STATS raw=1000 filtered=300\r\n'
      const diag1 = '[agntspce] reporting stats raw=1000 filtered=300 port=9460\r\n'
      const diag2 = '[agntspce] POST response status=200\r\n'
      const out1 = filter.processOutput('s1', statsLine)
      const out2 = filter.processOutput('s1', diag1)
      const out3 = filter.processOutput('s1', diag2)
      expect(out1).not.toContain('AGNTSPCE_STATS')
      expect(out2).not.toContain('[agntspce]')
      expect(out3).not.toContain('[agntspce]')
    })

    it('passes through normal output lines unchanged', () => {
      const data = 'On branch gitdemo23\r\nnothing to commit\r\n'
      expect(filter.processOutput('s1', data)).toBe(data)
    })

    it('preserves normal output around stripped system lines', () => {
      const data = 'agntspce $ git status\r\nOn branch main\r\nAGNTSPCE_STATS raw=10 filtered=5\r\n'
      const display = filter.processOutput('s1', data)
      expect(display).toContain('On branch main')
      expect(display).not.toContain('agntspce $ git status')
      expect(display).not.toContain('AGNTSPCE_STATS')
    })

    it('hides a system line split across chunks', () => {
      // Marker split mid-line: first chunk is a partial marker line
      const out1 = filter.processOutput('s1', 'agntspce $ git st')
      expect(out1).not.toContain('agntspce')
      const out2 = filter.processOutput('s1', 'atus\r\n M x.ts\r\n$ \r\n')
      expect(out2).not.toContain('agntspce')
      expect(out2).toContain(' M x.ts')
      vi.advanceTimersByTime(2000)
      expect(emitted[emitted.length - 1]?.command).toBe('git')
    })
  })

  describe('wrapper marker detection (agntspce $ <cmd>)', () => {
    it('detects a command from the agntspce wrapper marker', () => {
      const event = runCommand(['agntspce $ git status\r\n', ' M src/App.tsx\r\n', '$ \r\n'])
      expect(event).not.toBeNull()
      expect(event.command).toBe('git')
      expect(event.args).toEqual(['status'])
    })

    it('passes raw output through and emits a CommandEvent', () => {
      const event = runCommand(['agntspce $ ls\r\n', 'file1.txt\r\nfile2.txt\r\n', '$ \r\n'])
      expect(event).not.toBeNull()
      expect(event.sessionId).toBe('s1')
      expect(event.rawOutput).toContain('file1.txt')
      expect(emitted.length).toBe(1)
    })
  })

  describe('shell prompt detection', () => {
    it('detects commands with specific RTK filters from shell prompts', () => {
      const event = runCommand(['$ git status\r\n', 'On branch main\r\nnothing to commit\r\n', '$ \r\n'])
      expect(event).not.toBeNull()
      expect(event.command).toBe('git')
    })

    it('ignores commands without a specific filter (e.g. cd)', () => {
      const event = runCommand(['$ cd src\r\n'])
      // No filterable command detected → no event
      expect(event).toBeNull()
    })
  })

  describe('AGNTSPCE_STATS handling', () => {
    it('uses wrapper-reported raw/filtered token counts', () => {
      const event = runCommand(['agntspce $ git status\r\n', 'AGNTSPCE_STATS raw=1000 filtered=300\r\n', ' M file.txt\r\n', '$ \r\n'])
      expect(event).not.toBeNull()
      expect(event.originalTokens).toBe(1000)
      expect(event.filteredTokens).toBe(300)
      expect(event.reduction).toBe(70)
    })
  })

  describe('reportTokenSavings', () => {
    it('emits an event with computed reduction', () => {
      const event = filter.reportTokenSavings(2000, 500, 'git-diff')
      expect(event).not.toBeNull()
      expect(event!.command).toBe('git-diff')
      expect(event!.originalTokens).toBe(2000)
      expect(event!.filteredTokens).toBe(500)
      expect(event!.reduction).toBe(75)
      expect(emitted.length).toBe(1)
    })

    it('dedupes identical token pairs within 5 seconds', () => {
      filter.reportTokenSavings(2000, 500, 'tool')
      const second = filter.reportTokenSavings(2000, 500, 'tool')
      expect(second).toBeNull()
      expect(emitted.length).toBe(1)
    })

    it('computes zero reduction for zero original tokens', () => {
      const event = filter.reportTokenSavings(0, 0, 'tool')
      expect(event!.reduction).toBe(0)
    })
  })

  describe('history and stats aggregation', () => {
    it('records command history per session', () => {
      runCommand(['agntspce $ git status\r\n', '$ \r\n'])
      const history = filter.getCommandHistory('s1')
      expect(history.length).toBe(1)
      expect(history[0].command).toBe('git')
    })

    it('returns all history across sessions', () => {
      runCommand(['agntspce $ git status\r\n', '$ \r\n'], 's1')
      runCommand(['agntspce $ npm test\r\n', '$ \r\n'], 's2')
      expect(filter.getAllCommandHistory().length).toBe(2)
    })

    it('aggregates stats and excludes agntspce-search events', () => {
      runCommand(['agntspce $ git status\r\n', '$ \r\n'])
      filter.reportTokenSavings(1000, 200, 'agntspce-search')
      const [{ stats }] = filter.getAllStats()
      expect(stats.eventsProcessed).toBe(1)
      expect(stats.totalOriginalTokens).toBeGreaterThan(0)
    })

    it('getAllHistory returns reduction metadata', () => {
      filter.reportTokenSavings(1000, 200, 'tool')
      const history = filter.getAllHistory()
      expect(history.length).toBe(1)
      expect(history[0].reduction).toBe(80)
      expect(history[0].rulesApplied).toEqual([])
    })
  })

  describe('reset and cleanup', () => {
    it('reset clears all state', () => {
      runCommand(['agntspce $ git status\r\n', '$ \r\n'])
      filter.reset()
      expect(filter.getAllCommandHistory().length).toBe(0)
      expect(filter.getAllStats()[0].stats.eventsProcessed).toBe(0)
    })

    it('cleanup keeps command history so per-session stats survive', () => {
      runCommand(['agntspce $ git status\r\n', '$ \r\n'])
      filter.cleanup('s1')
      expect(filter.getCommandHistory('s1').length).toBe(1)
      expect(filter.getAllStats()[0].stats.eventsProcessed).toBe(1)
    })

    it('cleanup removes transient per-session state', () => {
      filter.processOutput('s1', 'agntspce $ git status\r\n')
      filter.processOutput('s1', 'output\r\n')
      filter.cleanup('s1')
      expect(filter.hasPendingTimer('s1')).toBe(false)
    })

    it('hasPendingTimer reflects scheduled finalize', () => {
      expect(filter.hasPendingTimer('s1')).toBe(false)
      filter.processOutput('s1', 'agntspce $ git status\r\n')
      filter.processOutput('s1', 'output\r\n')
      // mid-command with no prompt triggers a safety-net finalize timer
      expect(filter.hasPendingTimer('s1')).toBe(true)
      filter.reset()
    })
  })

  describe('line buffering across chunks', () => {
    it('handles commands split across PTY chunks', () => {
      const event = runCommand(['agntspce $ git st', 'atus\r\n', '$ \r\n'])
      expect(event).not.toBeNull()
      expect(event.command).toBe('git')
      expect(event.args).toEqual(['status'])
    })
  })

  describe('fallback compression (no detected command)', () => {
    it('creates an "output" event from accumulated output', () => {
      filter.processOutput('s1', 'some agent output line one\r\n')
      filter.processOutput('s1', 'some agent output line two\r\n')
      filter.processOutput('s1', 'some agent output line three\r\n')
      const event = filter.finalizeCommand('s1', 0)
      expect(event).not.toBeNull()
      expect(event!.command).toBe('output')
      expect(event!.rawOutput).toContain('line one')
    })

    it('collapses repeated blank lines when compressing', () => {
      filter.processOutput('s1', 'aaaa bbbb cccc dddd eeee\r\n')
      filter.processOutput('s1', '\r\n')
      filter.processOutput('s1', '\r\n')
      filter.processOutput('s1', '\r\n')
      filter.processOutput('s1', 'ffff gggg hhhh iiii jjjj\r\n')
      vi.advanceTimersByTime(2000)
      const event = filter.finalizeCommand('s1', 0)
      expect(event).not.toBeNull()
      expect(event!.filteredOutput).not.toMatch(/\n\n\n\n/)
    })
  })

  describe('persistence across restart', () => {
    let dir: string
    let persisted: OutputFilterService

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agntspce-filter-test-'))
    })

    afterEach(() => {
      if (persisted) {
        const t = (persisted as any)['_historySaveTimer']
        clearTimeout(t)
      }
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('reloads command history and totals on a new instance', () => {
      const f1 = new OutputFilterService(dir)
      f1.setOnCommandEvent(() => {})
      f1.processOutput('s1', 'agntspce $ git status\r\n')
      f1.processOutput('s1', 'AGNTSPCE_STATS raw=1000 filtered=300\r\n')
      f1.processOutput('s1', ' M x.ts\r\n')
      f1.processOutput('s1', '$ \r\n')
      vi.advanceTimersByTime(2000)
      f1.persistCumulativeStats()

      const f2 = new OutputFilterService(dir)
      persisted = f2
      expect(f2.getAllCommandHistory().length).toBe(1)
      expect(f2.getAllStats()[0].stats.eventsProcessed).toBe(1)
      expect(f2.getAllStats()[0].stats.totalOriginalTokens).toBe(1000)
      expect(f2.getCommandHistory('s1').length).toBe(1)
    })

    it('getAllStats reflects persisted history across instances', () => {
      const f1 = new OutputFilterService(dir)
      f1.setOnCommandEvent(() => {})
      f1.processOutput('s1', 'agntspce $ git status\r\n',)
      f1.processOutput('s1', '$ \r\n')
      vi.advanceTimersByTime(2000)
      f1.persistCumulativeStats()
      f1.cleanup('s1')

      const f2 = new OutputFilterService(dir)
      persisted = f2
      expect(f2.getCommandHistory('s1').length).toBe(1)
      expect(f2.getAllStats()[0].stats.eventsProcessed).toBe(1)
    })
  })
})
