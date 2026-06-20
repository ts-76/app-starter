# AIエージェント作業ルール

このリポジトリでは、本番に直接反映する操作は禁止です。

禁止:

- `wrangler deploy`
- `wrangler delete`
- `wrangler d1 migrations apply --remote`
- `terraform apply`
- `terraform destroy`
- `git push origin main`
- Cloudflare API tokenや`.env`内の秘密情報を表示すること

許可:

- ローカル開発
- 型チェック
- テスト
- Pull Request作成
- `apps/<app-name>/src` 配下の実装修正

Cloudflare Access、DNS、Terraform、共通認証パッケージを変更する場合は、基盤チームのレビューが必要です。
