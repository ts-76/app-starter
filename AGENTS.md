# AIエージェント作業ルール

このリポジトリでは、単一の社内アプリを人間のレビュー下で実装し、本番反映します。
AIエージェントは、まずこのファイルと作業対象に近いREADMEを読み、安全規則と検証手順を
確認してください。

## 最初に読む文書

1. `README.md`: アプリ構成、環境構築、ローカル確認、主要コマンド
2. `scripts/README.md`: Workers Builds、認証、運用コマンド
3. `ops/terraform/README.md`: Custom Domain、Zero Trust Access、Terraform state

共通ルールはこの`AGENTS.md`を正本とします。ツール固有の文書と食い違う場合は、この
ファイルの安全規則を優先します。実装と文書が食い違っている場合は、推測で進めず差分を
利用者へ報告します。

## 1リポジトリ1アプリ

アプリコード、Wrangler設定、Cloudflare設定はすべてこのリポジトリの単一Workerを対象と
します。複数アプリの登録、`apps/*` workspace、全アプリ列挙デプロイ、デプロイ方式の
切替機構は追加しません。別アプリは別リポジトリとして作成します。

## 変更は作業ブランチで行う

1. main上では編集せず、作業ブランチを作る
2. 対象コードと近接するREADMEを一緒に確認する
3. 変更種別に応じたチェックと手動確認を行う
4. 差分と未確認事項を利用者へ報告する
5. pushとPR作成まで依頼されている場合だけ、作業ブランチをpushしてPRを作る

ブランチ名は利用中のエージェント環境が要求する接頭辞に従います。指定がなければ
`feature/<内容>`を使います。mainへのpush、force push、リモートブランチの削除、
AIによるmainへのマージは禁止です。

## 変更箇所

- `src`: 画面、API、middleware、サービス
- `migrations`: D1スキーマ
- `wrangler.jsonc`: Worker binding、公開経路、環境変数
- `config/cloudflare/production.json`: アプリID、hostname、Cloudflare Account
- `config/access/production.csv`: Accessを許可するメールアドレス
- `scripts`: 入力検証、Workers Buildsデプロイ、インフラ操作の入口
- `ops/terraform`: Custom DomainとZero Trust Access

## 変更種別ごとの完了条件

| 変更種別                              | 必須チェック                         | 追加確認                                    |
| ------------------------------------- | ------------------------------------ | ------------------------------------------- |
| 文書のみ                              | `pnpm format:check`                  | コマンド、パス、リンクを実装と照合          |
| `src`・`wrangler.jsonc`・依存関係     | `pnpm run check`                     | READMEの認証あり・なしの手動確認            |
| D1 migration                          | `pnpm run check`                     | migrationを`--local`で適用し、対象APIを確認 |
| `config/cloudflare`・`config/access`  | `pnpm run check`、`pnpm infra:check` | hostnameと許可ユーザー数を確認              |
| `scripts`                             | `pnpm run check`                     | 対象コマンドのdry-runまたは非破壊経路を確認 |
| `ops/terraform`・`.github`・`.claude` | `pnpm run check`、`pnpm infra:check` | 編集前に利用者の明示確認が必要              |

`pnpm run check`はVite+の`vp check`と`vp test`、secretlintを実行します。挙動を変更した場合は
自動テストを追加または更新し、D1・R2・Cloudflare Accessを含む経路はREADMEの手動確認も
行ってください。

## 本番へ直接反映しない

Worker本体は「main更新 → Cloudflare Workers Builds」で反映します。GitHub Actionsへ
Cloudflare deploy tokenを置きません。ローカルやAIエージェントから、次の操作を行っては
いけません。

- `wrangler deploy`、`wrangler publish`、`wrangler delete`
- `pnpm deploy:builds`
- `wrangler d1 ... --remote`
- `wrangler secret put/delete/bulk`
- リモートKV/R2への作成、更新、削除
- 直接の`terraform apply`、`terraform destroy`

Workers BuildsのDeploy commandだけが`pnpm deploy:builds`を実行できます。スクリプトは
`WORKERS_CI`、Build UUID、mainブランチを検証します。

## DNS・Accessの反映には現在の会話での依頼が必要

資格情報なしの`pnpm infra:check`は通常のローカル検証として実行できます。

`pnpm infra:plan`は、利用者が現在の会話でDNS・Accessの確認または反映を依頼した場合だけ
実行します。planを提示した後、利用者が明示的に承認し、削除予定がない場合に限って
`pnpm infra:apply -- --yes`を実行できます。直接のTerraformコマンドは使いません。

## 秘密情報を表示しない

- `.env`、`.dev.vars`とその派生ファイルは、閲覧・表示・編集しない
- `.env.terraform.1password`は`op://`参照だけを含むため閲覧できるが、plan/applyの依頼が
  ない限り使用しない
- 秘密値が必要なコマンドは`op run --env-file <参照ファイル> -- <command>`で一時注入する
- 環境変数を一覧表示しない
- Cloudflare API tokenなどの値をチャット、ログ、Gitへ残さない

設定状況は`pnpm doctor`で確認します。値そのものを表示するコマンドへ置き換えてはいけません。
