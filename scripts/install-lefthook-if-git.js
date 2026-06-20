import { spawnSync } from 'node:child_process'

const gitCheck = spawnSync('git', ['rev-parse', '--git-dir'], {
  stdio: 'ignore',
})

if (gitCheck.status !== 0) {
  process.exit(0)
}

const result = spawnSync('lefthook', ['install'], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
