# AIエージェント作業ルール

このリポジトリでは、社内アプリの実装から本番反映までを人間のレビュー下で進めます。AIエージェントは、まずこのファイルと作業対象に最も近いREADMEを読み、安全規則と検証手順を確認してください。

## 最初に読む文書

1. `README.md`: リポジトリ全体の構成、環境構築、主要コマンド
2. `apps/<app-id>/README.md`: 対象アプリのローカルデータと動作確認
3. `scripts/README.md`: デプロイ方式、認証、運用コマンド
4. `ops/terraform/README.md`: DNS・Cloudflare Access・Terraform state

共通ルールはこの`AGENTS.md`を正本とします。`CLAUDE.md`などツール固有の文書と内容が食い違う場合は、このファイルの安全規則を優先してください。実装と文書が食い違っている場合は、推測で進めず差分を利用者へ報告します。

## 変更は作業ブランチで行う

1. main上では編集せず、作業ブランチを作る
2. 対象コードと近接するREADMEを一緒に確認する
3. 変更種別に応じたチェックと手動確認を行う
4. 差分と未確認事項を利用者へ報告する
5. pushとPR作成まで依頼されている場合だけ、作業ブランチをpushしてPRを作る

ブランチ名は利用中のエージェント環境が要求する接頭辞に従います。指定がなければ`feature/<内容>`を使います。mainへのpush、force push、リモートブランチの削除、AIによるmainへのマージは禁止です。

## 変更箇所は目的に合わせて選ぶ

- `apps/<app-id>/src`: アプリ固有の画面、API、サービス
- `apps/<app-id>/migrations`: D1スキーマの変更
- `apps/<app-id>/wrangler.jsonc`: Worker bindingと環境別設定
- `config/cloudflare/production.json`: アプリ、ドメイン、Access Listの割り当て
- `config/access/*.csv`: 閲覧を許可するメールアドレス
- `packages/*`: 複数アプリで使う認証、UI、設定
- `scripts/*`: 入力検証、生成、デプロイ、インフラ操作の入口
- `ops/terraform`: Cloudflareリソースの生成方式

アプリや利用者を追加するだけなら、通常は`ops/terraform`を編集しません。`pnpm new:app`または`config`を使います。

## 変更種別ごとの完了条件

| 変更種別                                                            | 必須チェック                     | 追加確認                                    |
| ------------------------------------------------------------------- | -------------------------------- | ------------------------------------------- |
| 文書のみ                                                            | `pnpm format:check`              | コマンド、パス、リンクを実装と照合          |
| アプリ・共通package                                                 | `pnpm check`                     | 対象アプリREADMEの手動確認                  |
| D1 migration                                                        | `pnpm check`                     | migrationを`--local`で適用し、対象APIを確認 |
| `config/cloudflare`・`config/access`                                | `pnpm check`、`pnpm infra:check` | 生成されるhostnameとAccess Listを確認       |
| `scripts`                                                           | `pnpm check`                     | 対象コマンドのdry-runまたは非破壊経路を確認 |
| `ops/terraform`・`packages/cloudflare-access`・`.github`・`.claude` | `pnpm check`、`pnpm infra:check` | 編集前に利用者の明示確認が必要              |

`pnpm check`はVite+の`vp check`と`vp test`、secretlintを実行します。`vp check`にはOxfmt、Oxlint、型チェックが含まれます。挙動を変更した場合は自動テストを追加または更新し、D1・R2・Cloudflare Accessを含む経路は対象アプリREADMEの手動確認も行ってください。

## 本番へ直接反映しない

Worker本体は「PR → 人間のレビュー → mainマージ → 設定済みのCI/CD」で反映します。ローカルやAIエージェントから、次の操作を行ってはいけません。

- `wrangler deploy`、`wrangler publish`、`wrangler delete`
- `wrangler d1 ... --remote`
- `wrangler secret put/delete/bulk`
- リモートKV/R2への作成、更新、削除
- 直接の`terraform apply`、`terraform destroy`
- `pnpm deploy:ci`、`pnpm deploy:builds`

CI/CDは`config/cloudflare/production.json`の`deployment.mode`で、Cloudflare Workers BuildsまたはGitHub Actionsの一方を選びます。

## DNS・Accessの反映には現在の会話での依頼が必要

資格情報なしの`pnpm infra:check`は、通常のローカル検証として実行できます。

`pnpm infra:plan`は、利用者が現在の会話でDNS・Accessの確認または反映を依頼した場合だけ実行します。planを提示した後、利用者が明示的に承認し、削除予定がない場合に限って`pnpm infra:apply -- --yes`を実行できます。直接のTerraformコマンドは使いません。

## 秘密情報を表示しない

- `.env`、`.dev.vars`とその派生ファイルは、閲覧・表示・編集しない
- `.env.terraform.1password`は`op://`参照だけを含むため閲覧できるが、plan/applyの依頼がない限り使用しない
- 秘密値が必要なコマンドは`op run --env-file <参照ファイル> -- <command>`で一時注入する
- 環境変数を一覧表示しない
- Cloudflare API tokenなどの値をチャット、ログ、Gitへ残さない

設定状況は`pnpm doctor`で確認します。値そのものを表示するコマンドへ置き換えてはいけません。
