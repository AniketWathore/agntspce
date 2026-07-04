export class OutputCompressor {
  compress(output: string): string {
    const lines = output.split('\n')
    return lines.map(line => {
      line = this.stripAnsi(line)
      line = this.dedupRepeats(line)
      if (line.length > 500) line = line.slice(0, 500) + '...'
      return line
    }).join('\n')
  }

  stripAnsi(text: string): string {
    return text.replace(/\u001b\[\d+(;\d+)*[A-Za-z]/g, '')
  }

  private dedupRepeats(line: string): string {
    return line.replace(/(.{4,}?)\1{3,}/g, (match, group) => {
      return group + ` [x${Math.floor(match.length / group.length)}]`
    })
  }

  truncateBuffer(buffer: string, maxSize = 50000): string {
    if (buffer.length <= maxSize) return buffer
    return '... [truncated ' + (buffer.length - maxSize) + ' chars] ...\n' + buffer.slice(-maxSize)
  }
}

export class PromptOptimizer {
  optimize(prompt: string): string {
    let result = prompt.trim()
    result = this.compressSystemInstructions(result)
    result = this.removeRedundantContext(result)
    return result
  }

  private compressSystemInstructions(text: string): string {
    const instructions = [
      'you are an expert',
      'you are a helpful',
      'you are an ai',
      'you are a senior',
      'i want you to',
      'please',
    ]
    let result = text
    for (const instr of instructions) {
      const regex = new RegExp(instr, 'gi')
      result = result.replace(regex, '')
    }
    return result
  }

  private removeRedundantContext(text: string): string {
    const lines = text.split('\n')
    const seen = new Set<string>()
    return lines.filter(line => {
      const trimmed = line.trim().toLowerCase()
      if (seen.has(trimmed)) return false
      seen.add(trimmed)
      return true
    }).join('\n')
  }
}

export class TokenUsageTracker {
  private perSession = new Map<string, { inputTokens: number, outputTokens: number, estimatedCost: number }>()

  trackOutput(sessionId: string, text: string): void {
    const tokens = this.estimateTokens(text)
    const entry = this.perSession.get(sessionId) || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 }
    entry.outputTokens += tokens
    entry.estimatedCost += (tokens / 1000) * 0.015
    this.perSession.set(sessionId, entry)
  }

  trackInput(sessionId: string, text: string): void {
    const tokens = this.estimateTokens(text)
    const entry = this.perSession.get(sessionId) || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 }
    entry.inputTokens += tokens
    entry.estimatedCost += (tokens / 1000) * 0.003
    this.perSession.set(sessionId, entry)
  }

  getUsage(sessionId: string): { inputTokens: number, outputTokens: number, totalTokens: number, estimatedCost: number } | null {
    const entry = this.perSession.get(sessionId)
    if (!entry) return null
    return { ...entry, totalTokens: entry.inputTokens + entry.outputTokens }
  }

  getAllUsage(): { sessionId: string, inputTokens: number, outputTokens: number, totalTokens: number, estimatedCost: number }[] {
    const result: any[] = []
    for (const [sessionId, entry] of this.perSession) {
      result.push({ sessionId, ...entry, totalTokens: entry.inputTokens + entry.outputTokens })
    }
    return result
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.trim().length / 4))
  }

  cleanup(sessionId: string): void {
    this.perSession.delete(sessionId)
  }
}
