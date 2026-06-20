variable "zone_id" {
  description = "Cloudflare zone ID."
  type        = string
}

variable "name" {
  description = "DNS record name."
  type        = string
}

variable "content" {
  description = "DNS record target."
  type        = string
}
