# Sales Report

社内向け売上レポートアプリのHono Worker雛形です。`/api/reports`はD1の`reports`テーブルを読みます。R2の`ASSETS_BUCKET` bindingもありますが、現時点ではアプリコードから使用していません。

## 初回はD1 migrationをローカルへ適用する

リポジトリルートで次を実行します。`--local`を外したり、`--remote`へ変えたりしないでください。

```sh
pnpm --filter @internal/sales-report exec wrangler d1 migrations apply DB --local
pnpm --filter @internal/sales-report dev
```

ローカルのD1とR2は`apps/sales-report/.wrangler/state`へ保存され、Gitには追加されません。R2は`wrangler dev`がローカルストレージを用意するため、Cloudflare上のbucket作成やログインは不要です。

D1を初期状態へ戻す場合はdevサーバーを止め、`.wrangler/state/v3/d1`を別名で退避してからmigrationを再実行します。退避した状態が不要だと確認できるまでは削除しないでください。

## 必要なときだけサンプルレポートを追加する

一覧APIの確認用データは、ローカルDBにだけ追加します。

```sh
pnpm --filter @internal/sales-report exec wrangler d1 execute DB --local --command "INSERT OR REPLACE INTO reports (id, title, status) VALUES ('local-sample', 'ローカル確認用レポート', 'draft')"
```

## ローカルでは認証ヘッダーを明示する

本番ではCloudflare Accessが認証ヘッダーを付けます。ローカルでも認証middlewareは有効なため、HTTPクライアントから`cf-access-authenticated-user-email`を指定します。認証を無効化するローカル専用分岐はありません。

```sh
curl -i http://127.0.0.1:8787/health
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/health
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/api/me
curl -i -H 'cf-access-authenticated-user-email: local@example.com' http://127.0.0.1:8787/api/reports
```

確認結果は次のとおりです。

- ヘッダーなしの`/health`: `401`
- ヘッダー付きの`/health`: `200`と`ok`
- `/api/me`: ユーザーのメールアドレスと`environment: "local"`
- `/api/reports`: migration適用直後は空配列、サンプル追加後は1件以上

画面を確認するときも同じヘッダーが必要です。リクエストヘッダーを追加できるブラウザ拡張またはHTTPクライアントで`/app`を開いてください。

## 変更後は型チェックと手動確認を行う

```sh
pnpm test
pnpm check
```

Vite+内蔵のVitestで、認証拒否、health、ユーザー情報、D1レスポンス変換を自動確認します。APIや画面の挙動を変更した場合はテストを更新し、上記の認証あり・なしの手動確認も実施してください。完了報告には、実行したURLと結果を記載します。

## 本番反映

PRをmainへマージすると、`config/cloudflare/production.json`で選択したCI/CDが自動デプロイします。ローカルからの直接デプロイは禁止です。

デプロイ対象とcustom domainは`config/cloudflare/production.json`の登録内容から自動的に解決されます。閲覧できるユーザーは`config/access/sales.csv`で管理します。
