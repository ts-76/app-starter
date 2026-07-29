# Claude Code

@AGENTS.md

共通の作業ルールは`AGENTS.md`を正本とします。

## 使用ツール

- Git、mise、Node.js、pnpm / Corepack
- リポジトリに固定したVite+とWrangler
- GitHub CLI
- インフラ操作時のみTerraformと1Password CLI

不足するツールはClaude Codeが固定バージョンに従って導入します。利用者へ手動導入を依頼する
前に、`mise.toml`、`package.json`、lockfileを確認してください。Vite+とWranglerは
グローバルに導入しません。

GitHub、Cloudflare、1Passwordの対話ログインと、管理者権限を使うインストールは利用者が
行います。認証情報を受け取ったり、チャットやログへ表示したりしてはいけません。

Claude Codeでは、`.claude/settings.json`と`.claude/hooks/block-dangerous-commands.js`も読み、
本番操作と秘密情報の誤操作をコマンド実行前にブロックします。
