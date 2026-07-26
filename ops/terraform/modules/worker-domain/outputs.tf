output "domain_id" {
  description = "Cloudflare Workers Custom Domain ID."
  value       = cloudflare_workers_custom_domain.this.id
}
