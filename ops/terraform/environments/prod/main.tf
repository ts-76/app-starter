provider "cloudflare" {}

locals {
  sales_report = {
    id            = "sales-report"
    name          = "Sales Report"
    domain        = "sales-report.tslab.app"
    access_group  = "sales"
    allowed_emails = []
  }
}

module "sales_report_access" {
  source = "../../modules/access-app"

  account_id     = var.account_id
  app_name       = local.sales_report.name
  app_domain     = local.sales_report.domain
  allowed_emails = local.sales_report.allowed_emails
}

module "sales_report_dns" {
  source = "../../modules/dns-record"

  zone_id = var.zone_id
  name    = "sales-report"
  content = "sales-report.workers.dev"
}
