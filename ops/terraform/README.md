# Terraform

Cloudflare Access、DNS、custom domain など、本番入口に関わる設定を管理する場所です。

各チームは `ops/terraform/apps/<app-name>.yaml` でアプリ登録を出し、基盤チームが確認して Terraform に反映します。

## 管理対象

- Cloudflare Access application
- Cloudflare Access policy
- DNS record
- custom domain
- 共通の命名ルール

## ローカルで禁止する操作

AI エージェントや通常のアプリ開発フローでは `terraform apply` と `terraform destroy` を実行しません。基盤チームの承認済み手順でのみ実行します。
