import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 1_000

interface HistoryMessage {
  role: 'user' | 'ai'
  text: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callGeminiOnce(apiKey: string, contents: unknown) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({ contents }),
      signal: controller.signal,
    })

    const data = (await geminiRes.json().catch(() => ({}))) as {
      error?: { message?: string }
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }

    return { ok: geminiRes.ok, status: geminiRes.status, data }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' })
    return
  }

  const { message, history } = (req.body ?? {}) as {
    message?: string
    history?: HistoryMessage[]
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message가 필요해요.' })
    return
  }

  const contents = [
    ...(Array.isArray(history) ? history : []).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS

    try {
      const { ok, status, data } = await callGeminiOnce(apiKey, contents)

      if (!ok) {
        // 4xx(요청 자체 오류)는 재시도해도 결과가 같으므로 바로 반환한다.
        if (status < 500) {
          const message = data?.error?.message ?? 'Gemini API 요청에 실패했어요.'
          res.status(status).json({ error: message })
          return
        }

        if (isLastAttempt) {
          res.status(502).json({
            error: '일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.',
            retryable: true,
          })
          return
        }

        await sleep(RETRY_DELAY_MS)
        continue
      }

      const text: string =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? '')
          .join('') ?? ''

      res.status(200).json({ text: text || '답변을 생성하지 못했어요. 다시 시도해주세요.' })
      return
    } catch {
      // 타임아웃(AbortError) 또는 네트워크 오류
      if (isLastAttempt) {
        res.status(504).json({
          error: '일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.',
          retryable: true,
        })
        return
      }

      await sleep(RETRY_DELAY_MS)
    }
  }
}
