import { sql } from '@vercel/postgres'

let usersTableReady: Promise<unknown> | null = null

export function ensureUsersTable() {
  if (!usersTableReady) {
    usersTableReady = sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((err) => {
      usersTableReady = null
      throw err
    })
  }
  return usersTableReady
}

let conversationsTablesReady: Promise<unknown> | null = null

export function ensureConversationsTables() {
  if (!conversationsTablesReady) {
    conversationsTablesReady = (async () => {
      await ensureUsersTable()

      await sql`
        CREATE TABLE IF NOT EXISTS conversations (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS conversations_user_id_updated_at_idx
          ON conversations (user_id, updated_at DESC)
      `

      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
          ai_provider TEXT,
          content TEXT NOT NULL,
          is_error BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
          ON messages (conversation_id, created_at)
      `
    })().catch((err) => {
      conversationsTablesReady = null
      throw err
    })
  }
  return conversationsTablesReady
}

export { sql }

export interface UserRow {
  id: number
  email: string
  password_hash: string
  created_at: string
}

export interface ConversationRow {
  id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: number
  conversation_id: number
  role: 'user' | 'ai'
  ai_provider: string | null
  content: string
  is_error: boolean
  created_at: string
}
