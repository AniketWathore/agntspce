import { describe, it, expect } from 'vitest'
import { getRegistry, filterCommandOutput } from '../rtk'

describe('rtk filter registry (plumbing command coverage)', () => {
  it('matches git -c global-option variants after normalization', () => {
    const registry = getRegistry()
    expect(registry.hasSpecificFilter('git -c core.quotepath=false status')).toBe(true)
    expect(registry.hasSpecificFilter('git --no-pager diff')).toBe(true)
    expect(registry.hasSpecificFilter('git ls-files --recurse-submodules')).toBe(true)
    // Non-git commands still unmatched
    expect(registry.hasSpecificFilter('echo hello world')).toBe(false)
  })

  it('reduces large ls-files listings', () => {
    const paths = Array.from({ length: 2000 }, (_, i) => `src/module${i}/file${i}.ts`)
    const { filtered, filterName } = filterCommandOutput('git -c core.quotepath=false ls-files --recurse-submodules', paths.join('\n'))
    expect(filterName).toBe('git-ls-files')
    const lines = filtered.split('\n')
    expect(lines.length).toBeLessThan(200)
    // Token reduction must be substantial
    const rawTokens = Math.ceil(paths.join('\n').length / 4)
    const filtTokens = Math.ceil(filtered.length / 4)
    expect(filtTokens).toBeLessThan(rawTokens * 0.2)
  })
})
