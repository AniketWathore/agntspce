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
