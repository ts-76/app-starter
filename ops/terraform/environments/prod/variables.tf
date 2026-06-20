variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID for internal tools."
  type        = string
}

variable "team_domain" {
  description = "Cloudflare Zero Trust team domain, for example your-team.cloudflareaccess.com."
  type        = string
}
