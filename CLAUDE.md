# AIエージェント作業ルール

このリポジトリは、非エンジニアがAIエージェントと一緒に社内アプリを開発するための基盤です。Workerの本番反映は必ず「PR → 人間のレビュー → mainマージ → GitHub Actions」の経路で行います。DNS・Accessは検証付きの`infra:*`コマンドだけを使い、利用者の明示承認後に反映します。

## 基本フロー(常にこの手順に従う)

1. 作業ブランチを作る: `git checkout -b feature/<内容>` (mainブランチ上では作業しない)
2. `apps/<app-name>/src` 配下を実装・修正する
3. `pnpm check` で品質チェックを通す
4. `git push origin <作業ブランチ>` して `gh pr create` でPRを作成する
5. mainへのマージは人間がレビューして行う。マージされると GitHub Actions が自動でデプロイする

新規アプリでは、GitHub ActionsによるWorker初回デプロイの成功後、利用者の明示依頼を受けて`pnpm infra:plan`と`pnpm infra:apply -- --yes`を実行し、Custom Domain・DNS・Accessを接続する。

## 新しいアプリを作るとき

```sh
pnpm new:app <app-id> --team <team> --owner-email <email>
```

これで`apps/<app-id>`の雛形、`config/cloudflare/production.json`のアプリ登録、`config/access/<team>.csv`の初期ユーザーが生成されます。通常は`.tf`ファイルを編集しません。

アクセス許可の追加は`config/access/*.csv`へメールアドレスを追加します。ドメインやAccess Listの割り当ては`config/cloudflare/production.json`で管理します。

## 禁止(hookでも自動ブロックされる)

- 直接デプロイ・削除: `wrangler deploy` / `wrangler delete` / `pnpm ... deploy` など一切
- 本番リソースへの直接変更: `wrangler d1 ... --remote`、`wrangler secret put/delete`、`wrangler kv`/`r2` のリモート書き込み
- 直接の`terraform apply` / `terraform destroy`（検証付きの`pnpm infra:apply`だけを使う）
- mainへのpush、force push、リモートブランチ削除
- `.env` や `.dev.vars` など秘密情報ファイルの閲覧・表示・編集(`.env.1password` は op:// 参照のみなので可)
- Cloudflare API tokenなど秘密の値をチャットやログに出力すること

## 秘密情報の扱い

- 秘密の値は絶対に表示しない。設定の存在確認は `pnpm doctor` を使う(値はマスクされる)
- 実行時に秘密が必要なコマンドは `op run --env-file <役割別の.env.*.1password> -- <command>` の形で実行する
- デプロイ状況は `gh run list --workflow deploy.yml` で確認する。Cloudflare APIトークンは不要
- `.env.terraform.1password`はAccess・DNSの変更権限を参照するため、人間から明示的に頼まれたplan/applyだけで使う
- `CLOUDFLARE_DEPLOY_API_TOKEN`はGitHub Environmentだけに保存し、ローカルへ取得しない

## 利用者の明示確認が必要な変更

`ops/terraform`、`packages/cloudflare-access`、`.github`、`.claude`、DNS・Cloudflare Access設定。`ops/terraform`はリソース生成方式を変える場合だけ編集する。通常のアプリ・ユーザー・ドメイン追加は`config`だけを変更する。

## 許可されている操作

ローカル開発、型チェック、テスト、lint/format、PR作成、アプリ実装、`pnpm new:app`、`pnpm infra:check`、`pnpm infra:plan`。`pnpm infra:apply -- --yes`は利用者が現在の会話で明示的に依頼し、planに削除がない場合だけ実行できる。
