resource "cloudflare_dns_record" "this" {
  zone_id = var.zone_id
  name    = var.name
  content = var.content
  type    = "CNAME"
  proxied = true
  ttl     = 1
}
