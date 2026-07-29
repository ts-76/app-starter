export type ReportSummary = {
  id: string
  title: string
  status: string
  createdAt: string
}

type ReportRow = {
  id: string
  title: string
  status: string
  created_at: string
}

export async function listReports(db: D1Database): Promise<ReportSummary[]> {
  const { results } = await db
    .prepare('SELECT id, title, status, created_at FROM reports ORDER BY created_at DESC LIMIT 20')
    .all<ReportRow>()

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
  }))
}
