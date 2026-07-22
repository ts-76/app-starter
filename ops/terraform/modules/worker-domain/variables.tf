variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID."
  type        = string
}

variable "zone_name" {
  description = "Cloudflare zone name."
  type        = string
}

variable "hostname" {
  description = "Hostname routed to the Worker."
  type        = string
}

variable "service" {
  description = "Worker service name."
  type        = string
}
