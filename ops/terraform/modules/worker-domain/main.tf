resource "cloudflare_workers_custom_domain" "this" {
  account_id = var.account_id
  zone_id    = var.zone_id
  zone_name  = var.zone_name
  hostname   = var.hostname
  service    = var.service
}
