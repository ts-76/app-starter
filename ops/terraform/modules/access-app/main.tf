resource "cloudflare_zero_trust_access_application" "this" {
  account_id = var.account_id
  name       = var.app_name
  domain     = var.app_domain
  type       = "self_hosted"
}

resource "cloudflare_zero_trust_access_policy" "allow_team" {
  account_id     = var.account_id
  application_id = cloudflare_zero_trust_access_application.this.id
  name           = "Allow approved users"
  decision       = "allow"
  precedence     = 1

  include {
    email = var.allowed_emails
  }
}
