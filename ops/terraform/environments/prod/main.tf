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

check "known_access_lists" {
  assert {
    condition     = alltrue([for app in values(var.apps) : contains(keys(var.access_lists), app.access_list)])
    error_message = "Every app.access_list must refer to an access_lists entry."
  }
}

locals {
  zone_id = length(data.cloudflare_zones.production.result) == 1 ? data.cloudflare_zones.production.result[0].id : ""
}

resource "cloudflare_zero_trust_list" "email" {
  for_each = var.access_lists

  account_id  = var.account_id
  name        = "${var.project_id}-${each.key}-emails"
  description = "Managed by Terraform for ${var.project_id}."
  type        = "EMAIL"
  items       = each.value
}

module "access" {
  source   = "../../modules/access-app"
  for_each = var.apps

  account_id    = var.account_id
  app_name      = "${var.project_id}-${each.key}"
  app_domain    = each.value.hostname
  policy_name   = "${var.project_id}-${each.key}-allow-${each.value.access_list}"
  email_list_id = cloudflare_zero_trust_list.email[each.value.access_list].id

  depends_on = [module.worker_domain]
}

module "worker_domain" {
  source   = "../../modules/worker-domain"
  for_each = var.apps

  account_id = var.account_id
  zone_id    = local.zone_id
  zone_name  = var.base_domain
  hostname   = each.value.hostname
  service    = each.key
}

# 旧・アプリごとの個別モジュールからの state 移行。
moved {
  from = module.sales_report_access
  to   = module.access["sales-report"]
}
