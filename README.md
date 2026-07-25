# Internal Tools

Hono、Cloudflare Workers、pnpm workspace を使う社内アプリ基盤です。

## 構成

- `apps/*`: 各チームの Hono Worker アプリ
- `config/*`: 利用者が編集するドメイン、アプリ登録、Access許可ユーザー
- `packages/*`: 共通認証、UI、設定、TypeScript 設定
- `ops/terraform`: 通常は変更しないCloudflare Access・DNSの生成ロジック
- `.github/*`: 品質、依存関係、CodeQL の CI
- `.claude/*`: AI エージェント向けの安全柵

## 開発

```sh
pnpm install
pnpm --filter @internal/sales-report dev
```

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

Workerの本番デプロイは`config/cloudflare/production.json`の`deployment.mode`で、Cloudflare Workers BuildsまたはGitHub Actionsのどちらか一方を選びます。両方の実行経路には排他ガードがあり、選択されていない経路はデプロイせず正常終了します。DNS・Accessは、直接のTerraformコマンドを禁止し、入力検証・削除防止・state確認を備えた `infra:*` コマンドだけを利用します。

## チェック

```sh
pnpm check
pnpm infra:check
```

## 本番反映

Worker本体は、Cloudflare Workers BuildsまたはGitHub Actionsが`main`へのマージを検知して自動反映します。ローカルやAIエージェントからの直接デプロイは禁止です。Custom Domain・DNS・Accessは、明示依頼を受けたAIエージェントが検証付きの`infra:*`経由で反映します。

`cloudflare-builds`ではCloudflare DashboardとGitHubのCheck、`github-actions`ではGitHubの`Production Deploy` Workflowで成功・失敗を確認します。初期設定、認証、方式の切替手順は[scripts/README.md](scripts/README.md)を参照してください。
