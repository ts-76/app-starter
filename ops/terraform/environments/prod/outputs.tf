output "access_app_id" {
  description = "Cloudflare Access application ID."
  value       = cloudflare_zero_trust_access_application.this.id
}

output "access_auth_domain" {
  description = "Cloudflare Access organization authentication domain."
  value       = cloudflare_zero_trust_organization.this.auth_domain
}

output "access_identity_provider_id" {
  description = "Cloudflare Access one-time PIN identity provider ID."
  value       = cloudflare_zero_trust_access_identity_provider.one_time_pin.id
}

output "access_list_id" {
  description = "Cloudflare Zero Trust EMAIL list ID."
  value       = cloudflare_zero_trust_list.email.id
}

output "worker_domain_id" {
  description = "Cloudflare Workers Custom Domain ID."
  value       = cloudflare_workers_custom_domain.this.id
}
