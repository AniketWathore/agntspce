
import { execCapture, runStreaming as _runStreaming, type StreamFilter } from './stream'
import { TimedExecution, Tracker } from './tracking'
import { neverWorse } from './guard'
import { teeAndHint } from './tee'

export type CaptureFilter = (text: string) => string
export type ExitAwareCaptureFilter = (text: string, exitCode: number) => string

export type RunMode =
  | { type: 'filtered'; filter: CaptureFilter }
  | { type: 'filteredWithExit'; filter: ExitAwareCaptureFilter }
  | { type: 'streamed'; filter: StreamFilter }
  | { type: 'passthrough' }

export interface RunOptions {
  teeLabel?: string
  filterStdoutOnly?: boolean
  skipFilterOnFailure?: boolean
  noTrailingNewline?: boolean
  inheritStdin?: boolean
}

export function emitGuarded(filtered: string, hint: string | undefined, raw: string): string {
  const body = hint ? `${filtered}\n${hint}` : filtered
  const shown = neverWorse(raw, body)
  return shown
}

export async function run(
  cmd: string,
  args: string[],
  toolName: string,
  argsDisplay: string,
  mode: RunMode,
  opts: RunOptions = {},
  cwd?: string,
  tracker?: Tracker,
): Promise<number> {
  const timer = TimedExecution.start()
  const cmdLabel = `${toolName} ${argsDisplay}`

  switch (mode.type) {
    case 'filtered':
    case 'filteredWithExit': {
      const result = await execCapture(cmd, args, cwd)
      const exitCode = result.exitCode
      const raw = result.stdout + result.stderr
      const rawForFilter = opts.filterStdoutOnly ? result.stdout : raw

      if (opts.skipFilterOnFailure && exitCode !== 0) {
        if (result.stdout.trim()) process.stdout.write(result.stdout)
        if (result.stderr.trim()) process.stderr.write(result.stderr)
        timer.track(cmdLabel, cmdLabel, raw, raw, tracker, cwd)
        return exitCode
      }

      let filtered: string
      if (mode.type === 'filtered') {
        filtered = mode.filter(rawForFilter)
      } else {
        filtered = mode.filter(rawForFilter, exitCode)
      }

      let shown: string
      if (opts.teeLabel) {
        const hint = teeAndHint(raw, opts.teeLabel, exitCode)
        shown = emitGuarded(filtered, hint, rawForFilter)
        process.stdout.write(shown)
      } else {
        shown = neverWorse(rawForFilter, filtered)
        if (opts.noTrailingNewline) {
          process.stdout.write(shown)
        } else {
          process.stdout.write(shown + '\n')
        }
      }

      timer.track(cmdLabel, cmdLabel, rawForFilter, shown, tracker, cwd)
      return exitCode
    }

    case 'streamed': {
      const streamResult = await _runStreaming(cmd, args, {
        filterMode: 'streaming',
        streamFilter: mode.filter,
      }, cwd)

      if (opts.teeLabel) {
        const hint = teeAndHint(streamResult.raw, opts.teeLabel, streamResult.exitCode)
        if (hint) process.stdout.write(hint + '\n')
      }

      timer.track(cmdLabel, cmdLabel, streamResult.raw, streamResult.filtered, tracker, cwd)
      return streamResult.exitCode
    }

    case 'passthrough': {
      const streamResult = await _runStreaming(cmd, args, {
        stdinMode: 'inherit',
        filterMode: 'passthrough',
      }, cwd)
      timer.trackPassthrough(cmdLabel, cmdLabel, tracker)
      return streamResult.exitCode
    }
  }
}

export async function runFiltered(
  cmd: string,
  args: string[],
  toolName: string,
  argsDisplay: string,
  filterFn: CaptureFilter,
  opts: RunOptions = {},
  cwd?: string,
  tracker?: Tracker,
): Promise<number> {
  return run(cmd, args, toolName, argsDisplay, { type: 'filtered', filter: filterFn }, opts, cwd, tracker)
}

export async function runFilteredWithExit(
  cmd: string,
  args: string[],
  toolName: string,
  argsDisplay: string,
  filterFn: ExitAwareCaptureFilter,
  opts: RunOptions = {},
  cwd?: string,
  tracker?: Tracker,
): Promise<number> {
  return run(cmd, args, toolName, argsDisplay, { type: 'filteredWithExit', filter: filterFn }, opts, cwd, tracker)
}

export async function runStreamed(
  cmd: string,
  args: string[],
  toolName: string,
  argsDisplay: string,
  filter: StreamFilter,
  opts: RunOptions = {},
  cwd?: string,
  tracker?: Tracker,
): Promise<number> {
  return run(cmd, args, toolName, argsDisplay, { type: 'streamed', filter }, opts, cwd, tracker)
}

export function runPassthrough(tool: string, args: string[], _verbose = 0, cwd?: string): Promise<number> {
  return run(tool, args, tool, args.join(' '), { type: 'passthrough' }, {}, cwd)
}
