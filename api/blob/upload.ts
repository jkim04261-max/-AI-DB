import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '../_lib/auth'

// 지시서(첨부 파일 확장): api/conversations/[id].ts의
// ALLOWED_ATTACHMENT_MIME_TYPES와 반드시 같은 목록이어야 한다 — 여기서
// 막힌 타입은 업로드 자체가 안 되므로, 둘 중 하나만 넓히면 업로드는
// 성공했는데 전송은 거부되는(또는 그 반대) 불일치가 생긴다.
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8MB

// Generates short-lived client tokens for direct browser -> Vercel Blob
// uploads (see src/pages/ChatPage.tsx), so image bytes never have to pass
// through this serverless function's own request body.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = await getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  try {
    const body = req.body as HandleUploadBody
    const jsonResponse = await handleUpload({
      // The Blob store connected to this project generates env vars with a
      // "NEW_" prefix instead of the SDK's default `BLOB_READ_WRITE_TOKEN`
      // (Vercel adds that prefix automatically when a name would collide,
      // and it isn't editable from the dashboard) — pass it explicitly
      // rather than relying on handleUpload()'s implicit env lookup, which
      // only ever checks `BLOB_READ_WRITE_TOKEN`. Falls back to that
      // default name (via handleUpload's own env lookup) when unset, so
      // local dev can still use the standard `BLOB_READ_WRITE_TOKEN`.
      token: process.env.NEW_READ_WRITE_TOKEN,
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('[api/blob/upload] upload completed', blob.pathname)
      },
    })
    res.status(200).json(jsonResponse)
  } catch (err) {
    console.error('[api/blob/upload] error', err)
    res.status(400).json({ error: err instanceof Error ? err.message : '업로드에 실패했어요.' })
  }
}
