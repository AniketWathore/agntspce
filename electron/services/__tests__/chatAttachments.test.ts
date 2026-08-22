import { describe, it, expect } from 'vitest'
import { toModelMessages } from '../chatTypes'

describe('toModelMessages', () => {
  it('passes plain messages through as string content', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'hi', timestamp: 1 },
      { id: '2', role: 'assistant' as const, content: 'hello', timestamp: 2 },
    ]
    expect(toModelMessages(msgs)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('builds image parts for image attachments', () => {
    const msgs = [{
      id: '1', role: 'user' as const, content: 'what is this?', timestamp: 1,
      attachments: [{ name: 'shot.png', mediaType: 'image/png', kind: 'image' as const, data: 'aGk=' }],
    }]
    const out = toModelMessages(msgs)
    expect(out[0].content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image', image: 'aGk=', mimeType: 'image/png' },
    ])
  })

  it('inlines text-file contents into the text part (works with text-only models)', () => {
    const msgs = [{
      id: '1', role: 'user' as const, content: 'review this', timestamp: 1,
      attachments: [{ name: 'a.ts', mediaType: 'text/plain', kind: 'file' as const, data: 'const x = 1' }],
    }]
    const out = toModelMessages(msgs)
    expect(out[0].content).toHaveLength(1)
    expect(out[0].content[0].type).toBe('text')
    expect(out[0].content[0].text).toContain('Attached file "a.ts"')
    expect(out[0].content[0].text).toContain('const x = 1')
  })

  it('emits pdf file parts', () => {
    const msgs = [{
      id: '1', role: 'user' as const, content: 'summarize', timestamp: 1,
      attachments: [{ name: 'doc.pdf', mediaType: 'application/pdf', kind: 'file' as const, data: 'JVBERi0=' }],
    }]
    const out = toModelMessages(msgs)
    expect(out[0].content).toEqual([
      { type: 'text', text: 'summarize' },
      { type: 'file', data: 'JVBERi0=', mediaType: 'application/pdf' },
    ])
  })
})
