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

variable "allowed_emails" {
  description = "Email addresses allowed to access the application."
  type        = list(string)
  default     = []
}
