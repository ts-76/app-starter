# Internal Tools

Hono、Cloudflare Workers、Vite+、pnpm workspaceを使う社内アプリ基盤です。

## 構成

- `apps/*`: 各チームの Hono Worker アプリ
- `config/*`: 利用者が編集するドメイン、アプリ登録、Access許可ユーザー
- `packages/*`: 共通認証、UI、設定、TypeScript 設定
- `ops/terraform`: 通常は変更しないCloudflare Access・DNSの生成ロジック
- `.github/*`: 品質、依存関係、Semgrep の CI
- `vite.config.ts`: Vite+のlint、format、型チェック、test、staged-file設定
- `AGENTS.md`: AI エージェント共通の作業ルールと完了条件
- `.claude/*`: Claude Code向けの追加の安全柵

## Node 22.6以降、pnpm 11.8、Vite+を使う

日常のアプリ開発には、mise、Node.js 22.6以上23未満、pnpm 11.8.0、Gitを使います。NodeのTypeScript直接実行を利用しているため、Node 22.0では運用スクリプトを実行できません。`mise.toml`には検証済みのNodeとTerraformを固定しています。

PRを作る場合はGitHub CLI(`gh`)、DNS・Accessを扱う場合は1Password CLI(`op`)とCloudflare資格情報も必要です。Wranglerはworkspaceの依存関係として入るため、グローバルインストールは不要です。

初回は次の順で準備します。

```sh
mise install
mise exec -- corepack enable
mise exec -- corepack prepare pnpm@11.8.0 --activate
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm exec vp --version
mise exec -- pnpm doctor
```

miseのshell連携が有効なら、以後の`mise exec --`は省略できます。shell連携を使わない環境では、本文の`pnpm ...`を`mise exec -- pnpm ...`に読み替えてください。

`pnpm doctor`はツール、GitHub、Cloudflareの認証状態を値を伏せて表示します。表示された`missing`のうち、担当する作業に必要な項目を解消してください。アプリのローカル起動だけなら、Terraformと1Password CLIは不要です。

## sales-reportをローカルで動かす

初回はD1 migrationをローカルDBへ適用してから起動します。

```sh
pnpm --filter @internal/sales-report exec wrangler d1 migrations apply DB --local
pnpm --filter @internal/sales-report dev
```

認証ヘッダー、D1のサンプルデータ、R2のローカル動作、確認URLは[apps/sales-report/README.md](apps/sales-report/README.md)を参照してください。

## 新しいアプリを作る

```sh
pnpm new:app <app-id> --team <team> --owner-email <email>
```

アプリ本体の雛形に加え、`config/cloudflare/production.json` のアプリ登録と `config/access/<team>.csv` の初期ユーザーがまとめて生成されます。PRをmainへマージすると、設定したデプロイ方式でWorker本体を反映します。新規アプリの初回だけ、その成功後に`infra:apply`でCustom DomainとAccessを接続します。

アクセスできる人を増やすときは、対応する `config/access/*.csv` にメールアドレスを追加します。DNS・Access設定は `pnpm infra:plan` で確認し、利用者の明示承認後に `pnpm infra:apply -- --yes` で反映します。Terraformコードを編集する必要はありません。

## 非エンジニアの方へ

このリポジトリは AI エージェント(Claude Code など)に作業を頼む前提で作られています。頼み方の例:

- 「sales-report の一覧画面に検索を追加して」→ エージェントが実装し、チェックを通して PR まで作ります
- 「経費精算アプリを新しく作りたい」→ `pnpm new:app` で雛形から作ります
- 「〇〇さんがアプリを見られるようにして」→ Access ListのCSVを更新し、設定を検証します
- 「ドメインと閲覧制限を反映して」→ Terraform planを表示し、確認後に固定手順で反映します

Workerの本番デプロイは`config/cloudflare/production.json`の`deployment.mode`で、Cloudflare Workers BuildsまたはGitHub Actionsのどちらか一方を選びます。両方の実行経路には排他ガードがあり、選択されていない経路はデプロイせず正常終了します。DNS・Accessは、直接のTerraformコマンドを禁止し、入力検証・削除防止・state確認を備えた `infra:*` コマンドだけを利用します。Terraform stateはR2で共有し、別のPCでも同じ構成を安全に扱えます。

## チェック

```sh
pnpm check
pnpm infra:check
```

`pnpm check`はVite+の`vp check`と`vp test`、secretlintを実行します。`vp check`がOxfmt、Oxlint、型チェックをまとめて処理し、`vp test`がVite+内蔵のVitestを実行します。D1・R2・Cloudflare Accessを含む挙動を変えた場合は、対象アプリのREADMEにある手動確認も実施してください。変更種別ごとの完了条件は[AGENTS.md](AGENTS.md)を参照してください。

PRでは、通常の品質チェックに加えて次のセキュリティチェックを実行します。

- OSV-Scanner: PRで追加・更新した依存関係の既知脆弱性
- Semgrep: PRで変更したJavaScript/TypeScriptのうち、信頼度が中・高のセキュリティルール
- secretlint: リポジトリへ混入したシークレット

本番依存関係は、`Dependency Audit` Workflowでもmain更新時と毎週確認します。GitHub Code Securityの有料機能を前提にせず、コードや検査結果を外部サービスへ送らない構成です。

## 本番反映

Worker本体は、Cloudflare Workers BuildsまたはGitHub Actionsが`main`へのマージを検知して自動反映します。ローカルやAIエージェントからの直接デプロイは禁止です。Custom Domain・DNS・Accessは、明示依頼を受けたAIエージェントが検証付きの`infra:*`経由で反映します。

`cloudflare-builds`ではCloudflare DashboardとGitHubのCheck、`github-actions`ではGitHubの`Production Deploy` Workflowで成功・失敗を確認します。初期設定、認証、方式の切替手順は[scripts/README.md](scripts/README.md)を参照してください。
