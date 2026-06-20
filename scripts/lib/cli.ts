import { spawnSync } from 'node:child_process'

export type CommandResult = {
  status: number
  stdout: string
  stderr: string
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
  })

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function runInherited(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): number {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
  })

  return result.status ?? 1
}

export function commandExists(command: string): boolean {
  return run(command, ['--version']).status === 0
}

export function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Could not parse JSON from ${label}.`)
  }
}

export function mask(value: string | undefined): string {
  if (!value) {
    return ''
  }

  if (value.length <= 8) {
    return '********'
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
