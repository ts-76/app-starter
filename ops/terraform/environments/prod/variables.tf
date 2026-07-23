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
  description = "Cloudflare zone name used for production hostnames."
  type        = string
}

variable "apps" {
  description = "Normalized production application registrations."
  type = map(object({
    name        = string
    hostname    = string
    access_list = string
  }))
}

variable "access_lists" {
  description = "Reusable Zero Trust EMAIL lists keyed by a stable list ID."
  type = map(list(object({
    value       = string
    description = string
  })))

  validation {
    condition = alltrue(flatten([
      for items in values(var.access_lists) : [
        for item in items : can(regex("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$", item.value))
      ]
    ]))
    error_message = "Every access list value must be an email address."
  }
}
