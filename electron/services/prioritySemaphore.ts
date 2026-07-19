interface QueuedWaiter {
  priority: number
  resolve: (release: () => void) => void
  reject: (err: Error) => void
  signal?: AbortSignal
}

export class PrioritySemaphore {
  private inUse = 0
  private queue: QueuedWaiter[] = []

  constructor(private max: number) {}

  acquire(priority: number, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new Error('Aborted'))

    if (this.inUse < this.max) {
      this.inUse++
      return Promise.resolve(() => this.release())
    }

    return new Promise((resolve, reject) => {
      const waiter: QueuedWaiter = { priority, resolve, reject, signal }
      const idx = this.queue.findIndex(w => w.priority > priority)
      if (idx === -1) this.queue.push(waiter)
      else this.queue.splice(idx, 0, waiter)

      if (signal) {
        const onAbort = () => {
          const i = this.queue.indexOf(waiter)
          if (i !== -1) this.queue.splice(i, 1)
          reject(new Error('Aborted'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private release(): void {
    this.inUse--
    this.pump()
  }

  private pump(): void {
    while (this.queue.length > 0 && this.inUse < this.max) {
      const waiter = this.queue.shift()!
      if (waiter.signal?.aborted) continue
      this.inUse++
      waiter.resolve(() => this.release())
    }
  }

  get currentLoad(): number {
    return this.inUse
  }

  get queuedCount(): number {
    return this.queue.length
  }

  reset(): void {
    const err = new Error('Semaphore reset')
    for (const w of this.queue) w.reject(err)
    this.queue.length = 0
    this.inUse = 0
  }
}
