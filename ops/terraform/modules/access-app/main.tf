resource "cloudflare_zero_trust_access_application" "this" {
  account_id = var.account_id
  name       = var.app_name
  domain     = var.app_domain
  type       = "self_hosted"

  policies = [{
    name       = var.policy_name
    decision   = "allow"
    precedence = 1
    include = [{
      email_list = {
        id = var.email_list_id
      }
    }]
  }]
}
