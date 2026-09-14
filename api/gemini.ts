import type { VercelRequest, VercelResponse } from '@vercel/node'

// Overridable via env in case Google retires/renames this model again —
// `gemini-flash-latest` is Google's stable alias that always resolves to
// their current default flash model, so it doesn't need to be updated by hand.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

interface HistoryMessage {
  role: 'user' | 'ai'
  text: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GeminiCallResult {
  status: number
  data: {
    error?: { message?: string }
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
}

async function callGeminiWithRetry(apiKey: string, contents: unknown): Promise<GeminiCallResult> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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

      const data = (await geminiRes.json()) as GeminiCallResult['data']

      // Retry on rate limiting / transient server errors, not on 4xx like
      // bad request or bad API key.
      const isRetryable = geminiRes.status === 429 || geminiRes.status >= 500
      if (!geminiRes.ok && isRetryable && attempt < MAX_ATTEMPTS) {
        console.error(
          `[gemini] attempt ${attempt}/${MAX_ATTEMPTS} failed with status ${geminiRes.status}, retrying:`,
          data?.error?.message ?? data,
        )
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
        continue
      }

      return { status: geminiRes.status, data }
    } catch (err) {
      lastError = err
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      console.error(
        `[gemini] attempt ${attempt}/${MAX_ATTEMPTS} threw${isTimeout ? ' (timeout)' : ''}:`,
        err instanceof Error ? err.message : err,
        err instanceof Error ? err.cause : undefined,
      )
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini API 요청에 실패했어요.')
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

  try {
    const { status, data } = await callGeminiWithRetry(apiKey, contents)

    if (status < 200 || status >= 300) {
      console.error(`[gemini] request failed — status ${status}, model ${GEMINI_MODEL}:`, data?.error)
      const message = data?.error?.message ?? 'Gemini API 요청에 실패했어요.'
      res.status(status).json({ error: message })
      return
    }

    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('') ?? ''

    res.status(200).json({ text: text || '답변을 생성하지 못했어요. 다시 시도해주세요.' })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.error(
      `[gemini] request threw after retries — model ${GEMINI_MODEL}${isTimeout ? ' (timeout)' : ''}:`,
      err instanceof Error ? err.message : err,
      err instanceof Error && err.cause ? { cause: err.cause } : '',
    )
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'Gemini 응답이 너무 오래 걸려서 시간 초과됐어요. 다시 시도해주세요.'
        : 'Gemini 요청 중 오류가 발생했어요.',
    })
  }
}
