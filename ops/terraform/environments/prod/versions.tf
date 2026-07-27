terraform {
  required_version = "~> 1.15.0"

  # R2の接続先はconfig/cloudflare/production.jsonから自動生成し、
  # init時に-backend-configで渡します。資格情報は環境変数だけで渡します。
  backend "s3" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22.0"
    }
  }
}
