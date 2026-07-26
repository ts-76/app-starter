output "access_app_ids" {
  description = "Cloudflare Access application ID (アプリID別)."
  value       = { for id, mod in module.access : id => mod.application_id }
}

output "access_auth_domain" {
  description = "Cloudflare Access organization authentication domain."
  value       = cloudflare_zero_trust_organization.this.auth_domain
}

output "access_list_ids" {
  description = "Cloudflare Zero Trust reusable EMAIL list ID (リストID別)."
  value       = { for id, list in cloudflare_zero_trust_list.email : id => list.id }
}

output "worker_domain_ids" {
  description = "Cloudflare Workers Custom Domain ID (アプリID別)."
  value       = { for id, mod in module.worker_domain : id => mod.domain_id }
}
