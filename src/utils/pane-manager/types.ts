export type SplitDirection = 'horizontal' | 'vertical'

export type LayoutNode =
  | { type: 'leaf'; sessionId: string }
  | { type: 'split'; direction: SplitDirection; ratio: number; first: LayoutNode; second: LayoutNode }
