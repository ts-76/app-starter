export type LunchOption = {
  id: string
  name: string
  suggestedBy: string
  votes: number
  createdAt: string
}

type LunchOptionRow = {
  id: string
  name: string
  suggested_by: string
  votes: number
  created_at: string
}

export async function listLunchOptions(db: D1Database): Promise<LunchOption[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, suggested_by, votes, created_at
       FROM lunch_options
       ORDER BY votes DESC, created_at DESC
       LIMIT 30`,
    )
    .all<LunchOptionRow>()

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    suggestedBy: row.suggested_by,
    votes: row.votes,
    createdAt: row.created_at,
  }))
}

export async function createLunchOption(
  db: D1Database,
  input: { name: string; suggestedBy: string },
): Promise<string> {
  const id = crypto.randomUUID()

  await db
    .prepare('INSERT INTO lunch_options (id, name, suggested_by) VALUES (?, ?, ?)')
    .bind(id, input.name, input.suggestedBy)
    .run()

  return id
}

export async function voteForLunchOption(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE lunch_options SET votes = votes + 1 WHERE id = ?')
    .bind(id)
    .run()

  return result.meta.changes > 0
}
