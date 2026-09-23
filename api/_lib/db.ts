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

      // Legacy single-attachment columns. Superseded by message_attachments
      // below (a message can now carry multiple images), but left in place
      // — unused by new writes — instead of dropping them, since the
      // backfill below still reads out of them.
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT`
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`

      // One row per image (Vercel Blob URL + metadata; the file itself
      // never touches Postgres), so a single message can carry more than
      // one attachment.
      await sql`
        CREATE TABLE IF NOT EXISTS message_attachments (
          id SERIAL PRIMARY KEY,
          message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          url TEXT NOT NULL,
          mime_type TEXT,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS message_attachments_message_id_position_idx
          ON message_attachments (message_id, position)
      `

      // One-time (idempotent) backfill: copy any pre-existing single
      // attachment into the new table as its message's first (and only)
      // attachment, so older conversations keep showing their image after
      // this migration. Safe to re-run — the NOT EXISTS guard skips
      // messages that already have a row here.
      await sql`
        INSERT INTO message_attachments (message_id, position, url, mime_type, name)
        SELECT id, 0, attachment_url, attachment_mime_type, attachment_name
        FROM messages
        WHERE attachment_url IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM message_attachments ma WHERE ma.message_id = messages.id
          )
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
  // Legacy single-attachment columns — see the migration note in
  // ensureConversationsTables. New code reads attachments from
  // MessageAttachmentRow / message_attachments instead.
  attachment_url: string | null
  attachment_mime_type: string | null
  attachment_name: string | null
}

export interface MessageAttachmentRow {
  message_id: number
  position: number
  url: string
  mime_type: string | null
  name: string | null
}
