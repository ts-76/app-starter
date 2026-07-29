provider "cloudflare" {}

data "cloudflare_zones" "production" {
  account = {
    id = var.account_id
  }
  name      = var.base_domain
  status    = "active"
  max_items = 2
}

check "single_production_zone" {
  assert {
    condition     = length(data.cloudflare_zones.production.result) == 1
    error_message = "base_domain must match exactly one active Cloudflare zone."
  }
}

locals {
  zone_id = length(data.cloudflare_zones.production.result) == 1 ? data.cloudflare_zones.production.result[0].id : ""
}

resource "cloudflare_zero_trust_organization" "this" {
  account_id       = var.account_id
  auth_domain      = var.access_auth_domain
  name             = var.project_id
  session_duration = "24h"
}

resource "cloudflare_zero_trust_access_identity_provider" "one_time_pin" {
  account_id = var.account_id
  name       = "${var.project_id}-email-one-time-pin"
  type       = "onetimepin"
  config     = {}

  depends_on = [cloudflare_zero_trust_organization.this]
}

resource "cloudflare_zero_trust_list" "email" {
  account_id  = var.account_id
  name        = "${var.project_id}-${var.app_id}-emails"
  description = "Managed by Terraform for ${var.app_name}."
  type        = "EMAIL"
  items       = var.allowed_emails

  depends_on = [
    cloudflare_zero_trust_organization.this,
    cloudflare_zero_trust_access_identity_provider.one_time_pin,
  ]
}

resource "cloudflare_zero_trust_access_application" "this" {
  account_id = var.account_id
  name       = "${var.project_id}-${var.app_id}"
  domain     = var.hostname
  type       = "self_hosted"

  policies = [{
    name       = "${var.project_id}-${var.app_id}-allow"
    decision   = "allow"
    precedence = 1
    include = [{
      email_list = {
        id = cloudflare_zero_trust_list.email.id
      }
    }]
  }]

  depends_on = [cloudflare_zero_trust_organization.this]
}

resource "cloudflare_workers_custom_domain" "this" {
  account_id = var.account_id
  zone_id    = local.zone_id
  zone_name  = var.base_domain
  hostname   = var.hostname
  service    = var.app_id

  # Accessを先に作り、新規hostnameが一時的に未保護で公開されることを防ぐ。
  depends_on = [cloudflare_zero_trust_access_application.this]
}

# 複数アプリ構成から単一アプリ構成へのstate移行。
moved {
  from = cloudflare_zero_trust_list.email["sales"]
  to   = cloudflare_zero_trust_list.email
}

moved {
  from = module.access["sales-report"].cloudflare_zero_trust_access_application.this
  to   = cloudflare_zero_trust_access_application.this
}

moved {
  from = module.worker_domain["sales-report"].cloudflare_workers_custom_domain.this
  to   = cloudflare_workers_custom_domain.this
}
