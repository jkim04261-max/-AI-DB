import { sql } from '@vercel/postgres'

let tableReady: Promise<unknown> | null = null

export function ensureUsersTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((err) => {
      tableReady = null
      throw err
    })
  }
  return tableReady
}

export { sql }

export interface UserRow {
  id: number
  email: string
  password_hash: string
  created_at: string
}
