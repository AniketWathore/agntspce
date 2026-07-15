const DEFAULT_BUFFER_CAP = 64 * 1024;

export class RingBuffer {
  private chunks: string[] = [];
  private bytes = 0;
  private cap: number;
  private _totalWritten = 0;

  constructor(cap: number = DEFAULT_BUFFER_CAP) {
    this.cap = cap;
  }

  write(data: string): void {
    const byteLen = Buffer.byteLength(data);
    this.chunks.push(data);
    this.bytes += byteLen;
    this._totalWritten += byteLen;
    while (this.bytes > this.cap && this.chunks.length > 0) {
      const head = this.chunks.shift();
      if (head) this.bytes -= Buffer.byteLength(head);
    }
  }

  snapshot(): string {
    return this.chunks.join('');
  }

  get totalBytes(): number {
    return this._totalWritten;
  }

  get currentBytes(): number {
    return this.bytes;
  }

  clear(): void {
    this.chunks = [];
    this.bytes = 0;
    this._totalWritten = 0;
  }
}
