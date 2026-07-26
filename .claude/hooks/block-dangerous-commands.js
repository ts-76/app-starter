import { execSync } from 'node:child_process'

// AIエージェントのBashコマンドを本番反映・秘密情報漏えいから守るhook。
// exit 2 でブロックし、理由をstderrに出す(非エンジニアにも分かる日本語で)。

const rules = [
  {
    // wrangler deploy/publish/delete (pnpm exec / npx 経由も command 文字列に wrangler が含まれるため捕捉)
    pattern: /\bwrangler\b[^;&|]*\b(deploy|publish|delete)\b/,
    reason:
      '本番Workerへの直接デプロイ・削除は禁止です。PRを作成し、mainマージ後のGitHub Actionsに任せてください。',
  },
  {
    // package.json スクリプト経由のデプロイ (pnpm deploy, pnpm --filter x deploy, pnpm run deploy)
    pattern: /\b(pnpm|npm|yarn|bun)\b[^;&|]*\bdeploy\b/,
    reason: 'デプロイスクリプトの実行は禁止です。本番反映はPRとGitHub Actions経由で行います。',
  },
  {
    // リモートD1への直接変更
    pattern: /\bwrangler\b[^;&|]*\bd1\b[^;&|]*--remote\b/,
    reason:
      '本番D1データベースへの直接操作は禁止です。migrationはPRに含め、GitHub Actions経由で反映します。',
  },
  {
    // シークレットの書き換え・削除
    pattern: /\bwrangler\b[^;&|]*\bsecret\b[^;&|]*\b(put|delete|bulk)\b/,
    reason:
      'Workerシークレットの直接変更は禁止です。利用者がCloudflareまたはGitHubの管理画面で設定してください。',
  },
  {
    // リモートKV/R2への書き込み・削除 (--local 付きは許可)
    pattern: /\bwrangler\b[^;&|]*\b(kv|r2)\b[^;&|]*\b(put|delete|create)\b(?![^;&|]*--local\b)/,
    reason: '本番KV/R2への直接変更は禁止です。ローカル開発では --local を付けてください。',
  },
  {
    pattern: /\bterraform\b[^;&|]*\s(apply|destroy)\b/,
    reason:
      '直接のterraform apply/destroyは禁止です。入力検証と削除防止を行うpnpm infra:applyを使ってください。',
  },
  {
    // main/masterへのpush (origin main, HEAD:main, force含む)
    pattern: /\bgit\s+push\b[^;&|]*\b(main|master)\b/,
    reason: 'mainへの直接pushは禁止です。作業ブランチにpushしてPRを作成してください。',
  },
  {
    pattern: /\bgit\s+push\b[^;&|]*(\s-f\b|--force)/,
    reason: 'force pushは禁止です。',
  },
  {
    pattern: /\bgit\s+push\b[^;&|]*--delete\b/,
    reason: 'リモートブランチの削除pushは禁止です。',
  },
  {
    pattern: /\bprintenv\b/,
    reason:
      '環境変数の一覧表示は秘密情報を含む可能性があるため禁止です。存在確認は pnpm doctor を使ってください。',
  },
]

// 秘密情報ファイル (.env, .dev.vars) への言及を検出する。
// *.1password ファイルは op:// 参照のみで秘密値を含まないため許可。
function isAllowedSecretFile(token) {
  return token === '.env.example' || token.endsWith('.1password')
}

function findSecretFileToken(command) {
  const tokens = command.match(/(?<![\w.])\.(env|dev\.vars)[\w.-]*/g) ?? []
  return tokens.find((token) => !isAllowedSecretFile(token))
}

// 明示的なブランチ指定のない `git push` が main を対象にしていないか確認する。
function bareGitPushTargetsMain(command) {
  const match = command.match(/\bgit\s+push\b([^;&|]*)/)
  if (!match) {
    return false
  }

  const positional = match[1]
    .trim()
    .split(/\s+/)
    .filter((arg) => arg && !arg.startsWith('-'))

  // 第2引数(refspec)が明示されていて HEAD でなければ、他ルールに任せる
  if (positional.length >= 2 && !positional[1].includes('HEAD')) {
    return false
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    return branch === 'main' || branch === 'master'
  } catch {
    return false
  }
}

const chunks = []

process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '')

  for (const rule of rules) {
    if (rule.pattern.test(command)) {
      console.error(`ブロックしました: ${rule.reason}\ncommand: ${command}`)
      process.exit(2)
    }
  }

  const secretFile = findSecretFileToken(command)
  if (secretFile) {
    console.error(
      `ブロックしました: ${secretFile} は秘密情報ファイルのため読み書き・表示できません。` +
        `実行時に必要なら op run --env-file .env.1password -- <command> を使ってください。\ncommand: ${command}`,
    )
    process.exit(2)
  }

  if (bareGitPushTargetsMain(command)) {
    console.error(
      `ブロックしました: 現在mainブランチにいるため、このpushはmainへの直接pushになります。` +
        `作業ブランチを作成してください (git checkout -b feature/xxx)。\ncommand: ${command}`,
    )
    process.exit(2)
  }
})
