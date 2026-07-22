terraform {
  required_version = "~> 1.15.0"

  backend "local" {
    path = "../../../../.generated/terraform/production.tfstate"
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22.0"
    }
  }
}
