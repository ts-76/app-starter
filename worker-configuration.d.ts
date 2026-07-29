interface Env {
  DB: D1Database
  ASSETS_BUCKET: R2Bucket
  APP_ENV: 'local' | 'production'
  ACCESS_AUD: string
  ACCESS_TEAM_DOMAIN: string
}
