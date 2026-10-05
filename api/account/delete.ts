import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del } from '@vercel/blob'
import { ensureConversationsTables, sql } from '../_lib/db'
import { getSessionUser, buildClearedSessionCookie } from '../_lib/auth'

// Permanently deletes the signed-in user's account and all of their data.
// The caller's identity comes only from the session cookie (session.sub) —
// never from the request body — so this can only ever delete the account
// that's actually logged in.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  try {
    await ensureConversationsTables()

    // Collect the user's attachment Blob URLs before the DB rows that
    // reference them are gone, so they can still be deleted from Blob
    // storage afterward.
    const attachmentRows = await sql<{ url: string }>`
      SELECT a.url
      FROM message_attachments a
      JOIN messages m ON m.id = a.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${session.sub}
    `

    // Deleting the user row cascades to conversations -> messages ->
    // message_attachments via the ON DELETE CASCADE FKs set up in
    // ensureConversationsTables (api/_lib/db.ts) — the same "single
    // statement = atomic, no partial deletes" approach already used by
    // conversation deletion (see handleDelete in
    // api/conversations/[id].ts). Scoping the DELETE to the session's own
    // id (rather than a separate ownership check) also means this can only
    // ever remove the caller's own account.
    const result = await sql<{ id: number }>`
      DELETE FROM users
      WHERE id = ${session.sub}
      RETURNING id
    `
    if (result.rows.length === 0) {
      res.status(404).json({ error: '계정을 찾을 수 없어요.' })
      return
    }

    // The account record itself (the data this endpoint promises to
    // delete) is already gone at this point. Deleting the now-orphaned
    // Blob files is a best-effort cleanup on top of that — a Blob service
    // hiccup here shouldn't make account deletion appear to have failed.
    const urls = attachmentRows.rows.map((r) => r.url)
    if (urls.length > 0) {
      try {
        await del(urls, { token: process.env.NEW_READ_WRITE_TOKEN })
      } catch (err) {
        console.error('[api/account/delete] failed to delete blob files', err)
      }
    }

    res.setHeader('Set-Cookie', buildClearedSessionCookie())
    res.status(200).json({ deleted: true })
  } catch (err) {
    console.error('[api/account/delete] unexpected error', err)
    res.status(500).json({ error: '계정을 삭제하는 중 오류가 발생했어요.' })
  }
}
