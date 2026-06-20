interface Env {
  DB: D1Database
  ASSETS_BUCKET: R2Bucket
  APP_ENV: 'local' | 'staging' | 'production'
}
