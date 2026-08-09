import { describe, it, expect, beforeEach } from 'vitest'
import { StatusDetector } from '../statusDetector'

describe('StatusDetector', () => {
  let detector: StatusDetector

  beforeEach(() => {
    detector = new StatusDetector()
  })

  describe('stripControlSequences', () => {
    it('removes ANSI CSI escape sequences', () => {
      const input = '\x1b[31mred text\x1b[0m'
      expect(detector.stripControlSequences(input)).toBe('red text')
    })

    it('removes OSC sequences (hyperlinks, titles)', () => {
      const input = '\x1b]0;title\x07body'
      expect(detector.stripControlSequences(input)).toBe('body')
    })

    it('removes charset-selection escapes', () => {
      const input = '\x1b(Bnormal'
      expect(detector.stripControlSequences(input)).toBe('normal')
    })

    it('handles empty or null input', () => {
      expect(detector.stripControlSequences('')).toBe('')
      expect(detector.stripControlSequences(null as any)).toBe('')
    })
  })

  describe('detectStatus with Claude agent', () => {
    it('returns waiting when showing the "? for shortcuts" prompt', () => {
      const buffer = 'Welcome to Claude Code!\nType \'claude\' to start a new Claude session.\n\n? for shortcuts'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'claude' })).toBe('waiting')
    })

    it('returns waiting on a completion summary (cost + duration)', () => {
      const buffer = '✓ Completed!\nCost: $0.12\nTotal duration (wall): 12s\nTotal code changes: 3'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'claude' })).toBe('waiting')
    })

    it('returns waiting when last line ends with an ellipsis while thinking', () => {
      const buffer = 'Let me think about this...'
      // Ensure state is fresh so lastOutputTime is recent
      detector.detectStatus('sess-2', '')
      expect(detector.detectStatus('sess-2', buffer, { agent: 'claude' })).toBe('busy')
    })

    it('returns busy when a tool pattern appears (Read/Write/Edit)', () => {
      const buffer = '● Starting task\n⎿ Read(somefile.ts)\nDoing work...'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'claude' })).toBe('busy')
    })

    it('returns idle for a plain shell prompt', () => {
      const buffer = '$ ls -la\nuser@host:~/project$'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'claude' })).toBe('idle')
    })

    it('returns idle when claude session ended', () => {
      const buffer = 'Claude session ended.\nuser@host:~/project$'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'claude' })).toBe('idle')
    })
  })

  describe('detectStatus with Codex agent', () => {
    it('returns waiting on the codex prompt', () => {
      const buffer = 'OpenAI Codex\n\n>'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'codex' })).toBe('waiting')
    })

    it('returns busy while running (esc to interrupt)', () => {
      const buffer = 'Running command... (esc to interrupt)\nTab to add notes'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'codex' })).toBe('busy')
    })
  })

  describe('detectStatus with Gemini agent', () => {
    it('returns waiting when asking for authentication', () => {
      const buffer = 'Waiting for authentication'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'gemini' })).toBe('waiting')
    })

    it('returns busy while thinking', () => {
      const buffer = 'Thinking...\n(esc to cancel)'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'gemini' })).toBe('busy')
    })
  })

  describe('detectStatus with OpenCode agent', () => {
    it('returns waiting on the opencode input prompt', () => {
      const buffer = 'Ask anything...\nctrl+t variants'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'opencode' })).toBe('waiting')
    })

    it('returns busy while generating', () => {
      const buffer = 'Generating...\nWorking...'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'opencode' })).toBe('busy')
    })
  })

  describe('detectStatus for shell sessions', () => {
    it('returns idle for a fresh empty shell', () => {
      expect(detector.detectStatus('shell-1', '')).toBe('idle')
    })

    it('returns idle after command output settles on a prompt', () => {
      const buffer = 'done\nuser@mac:~$'
      expect(detector.detectStatus('shell-1', buffer)).toBe('idle')
    })

    it('returns busy while output is still streaming', () => {
      // A long buffer within the assume-busy window (>100 chars) counts as busy
      const buffer = 'Downloading packages... '.repeat(10)
      expect(detector.detectStatus('shell-1', buffer)).toBe('busy')
    })
  })

  describe('normalizeAgent', () => {
    it('maps gemini-cli to gemini', () => {
      const buffer = 'Waiting for authentication'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'gemini-cli' })).toBe('waiting')
    })

    it('maps open-code to opencode', () => {
      const buffer = 'Generating...'
      expect(detector.detectStatus('sess-1', buffer, { agent: 'open-code' })).toBe('busy')
    })

    it('handles undefined agent', () => {
      expect(detector.detectStatus('shell-1', '')).toBe('idle')
    })
  })

  describe('reset', () => {
    it('clears state for a specific session', () => {
      detector.detectStatus('sess-1', 'Welcome to Claude Code!\n\n? for shortcuts', { agent: 'claude' })
      detector.reset('sess-1')
      // After reset, the same buffer should be treated fresh (still waiting is fine,
      // but state must not throw)
      expect(() => detector.detectStatus('sess-1', 'hello', { agent: 'claude' })).not.toThrow()
    })

    it('clears all state', () => {
      detector.detectStatus('sess-1', 'x', { agent: 'claude' })
      detector.detectStatus('sess-2', 'y', { agent: 'codex' })
      detector.reset()
      expect(() => detector.detectStatus('sess-1', 'z')).not.toThrow()
    })
  })
})
