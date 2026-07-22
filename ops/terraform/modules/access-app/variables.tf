variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "app_name" {
  description = "Cloudflare Access application name."
  type        = string
}

variable "app_domain" {
  description = "Protected application domain."
  type        = string
}

variable "policy_name" {
  description = "Cloudflare Access policy name."
  type        = string
}

variable "email_list_id" {
  description = "Reusable Cloudflare Zero Trust EMAIL list ID."
  type        = string
}
