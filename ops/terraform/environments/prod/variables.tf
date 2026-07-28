variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "project_id" {
  description = "Stable project ID used to derive Cloudflare resource names."
  type        = string

  validation {
    condition     = can(regex("^[a-z](?:[a-z0-9-]*[a-z0-9])?$", var.project_id))
    error_message = "project_id must be a lowercase kebab-case ID."
  }
}

variable "base_domain" {
  description = "Cloudflare zone name used for the production hostname."
  type        = string
}

variable "access_auth_domain" {
  description = "Deterministically derived Cloudflare Access organization domain."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+\\.cloudflareaccess\\.com$", var.access_auth_domain))
    error_message = "access_auth_domain must be a cloudflareaccess.com hostname."
  }
}

variable "app_id" {
  description = "The single Worker application ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z](?:[a-z0-9-]*[a-z0-9])?$", var.app_id))
    error_message = "app_id must be a lowercase kebab-case ID."
  }
}

variable "app_name" {
  description = "Human-readable application name."
  type        = string
}

variable "hostname" {
  description = "Production hostname protected by Cloudflare Access."
  type        = string
}

variable "allowed_emails" {
  description = "Email addresses allowed to access the application."
  type = list(object({
    value       = string
    description = string
  }))

  validation {
    condition = alltrue([
      for item in var.allowed_emails :
      can(regex("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$", item.value))
    ])
    error_message = "Every allowed email value must be an email address."
  }
}
