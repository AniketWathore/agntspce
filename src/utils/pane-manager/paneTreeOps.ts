import type { LayoutNode } from './types'

const MIN_RATIO = 0.15
const MAX_RATIO = 0.85

export function clampRatio(r: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, r))
}

export function collectLeafIds(node: LayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.sessionId]
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)]
}

export function buildInitialTree(sessionIds: string[]): LayoutNode | null {
  const n = sessionIds.length
  if (n === 0) return null
  if (n === 1) return { type: 'leaf', sessionId: sessionIds[0] }
  if (n === 2) {
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', sessionId: sessionIds[0] },
      second: { type: 'leaf', sessionId: sessionIds[1] },
    }
  }
  if (n === 3) {
    // H 0.5 (A, V 0.5 B/C)
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', sessionId: sessionIds[0] },
      second: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', sessionId: sessionIds[1] },
        second: { type: 'leaf', sessionId: sessionIds[2] },
      },
    }
  }
  if (n === 4) {
    // H 0.5 (V A/C, V B/D) — left column A over C, right column B over D
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', sessionId: sessionIds[0] },
        second: { type: 'leaf', sessionId: sessionIds[2] },
      },
      second: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', sessionId: sessionIds[1] },
        second: { type: 'leaf', sessionId: sessionIds[3] },
      },
    }
  }
  if (n === 5) {
    // H 0.33 (A, V B/C, V D/E) variant — spec: H 0.33 (A, V B/C, V D/E)
    // Implemented as H 0.33 (A, H 0.5 (V B/D, V C/E)) -> but to keep left master 33%
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.33,
      first: { type: 'leaf', sessionId: sessionIds[0] },
      second: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { type: 'leaf', sessionId: sessionIds[1] },
          second: { type: 'leaf', sessionId: sessionIds[3] },
        },
        second: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { type: 'leaf', sessionId: sessionIds[2] },
          second: { type: 'leaf', sessionId: sessionIds[4] },
        },
      },
    }
  }
  // Generic balanced for 6+ — columns with vertical stacks
  const cols = Math.min(Math.ceil(Math.sqrt(n)), 4)
  let idx = 0
  const columns: LayoutNode[] = []
  for (let c = 0; c < cols; c++) {
    const remaining = n - idx
    const remainingCols = cols - c
    const take = Math.ceil(remaining / remainingCols)
    const ids = sessionIds.slice(idx, idx + take)
    idx += take
    if (ids.length === 0) break
    if (ids.length === 1) columns.push({ type: 'leaf', sessionId: ids[0] })
    else {
      function vStack(list: string[]): LayoutNode {
        if (list.length === 1) return { type: 'leaf', sessionId: list[0] }
        const mid = Math.ceil(list.length / 2)
        return {
          type: 'split',
          direction: 'vertical',
          ratio: mid / list.length,
          first: vStack(list.slice(0, mid)),
          second: vStack(list.slice(mid)),
        }
      }
      columns.push(vStack(ids))
    }
  }
  // Combine columns horizontally with even ratios
  function hCombine(list: LayoutNode[]): LayoutNode {
    if (list.length === 1) return list[0]
    const leftCount = Math.ceil(list.length / 2)
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: leftCount / list.length,
      first: hCombine(list.slice(0, leftCount)),
      second: hCombine(list.slice(leftCount)),
    }
  }
  return hCombine(columns)
}

export function updateRatioAtPath(
  node: LayoutNode | null,
  path: number[],
  newRatio: number
): LayoutNode | null {
  if (!node) return node
  if (path.length === 0) {
    if (node.type !== 'split') return node
    return { ...node, ratio: clampRatio(newRatio) }
  }
  if (node.type !== 'split') return node
  const [head, ...rest] = path
  if (head === 0) {
    return { ...node, first: updateRatioAtPath(node.first, rest, newRatio) as LayoutNode }
  }
  if (head === 1) {
    return { ...node, second: updateRatioAtPath(node.second, rest, newRatio) as LayoutNode }
  }
  return node
}

export function areLeafSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
  return true
}
