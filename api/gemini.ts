import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GeminiApiError, GeminiConfigError, getGeminiReply, type GeminiHistoryMessage } from './_lib/gemini'

// Explicit ceiling instead of relying on the platform default: comfortably
// above the Gemini call's worst case (two attempts x 10s timeout, plus one
// short backoff — see api/_lib/gemini.ts) so a genuinely slow request gets
// a clean error response instead of the platform killing the function
// mid-request.
export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { message, history } = (req.body ?? {}) as {
    message?: string
    history?: GeminiHistoryMessage[]
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message가 필요해요.' })
    return
  }

  try {
    const text = await getGeminiReply(message, Array.isArray(history) ? history : [])
    res.status(200).json({ text })
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      console.error('[api/gemini] GEMINI_API_KEY is not configured')
      res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' })
      return
    }
    if (err instanceof GeminiApiError) {
      console.error('[api/gemini] Gemini API error', err)
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[api/gemini] unexpected error', err)
    res.status(500).json({ error: 'Gemini 요청 중 오류가 발생했어요.' })
  }
}
