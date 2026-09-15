// Overridable via env in case Google retires/renames this model again —
// `gemini-flash-latest` is Google's stable alias that always resolves to
// their current default flash model, so it doesn't need to be updated by hand.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

export interface GeminiHistoryMessage {
  role: 'user' | 'ai'
  text: string
}

// Thrown when GEMINI_API_KEY isn't configured, so callers can distinguish a
// server misconfiguration from a downstream Gemini API failure.
export class GeminiConfigError extends Error {
  constructor() {
    super('GEMINI_API_KEY_MISSING')
    this.name = 'GeminiConfigError'
  }
}

// Preserves the upstream Gemini API's HTTP status so callers that expose it
// directly (api/gemini.ts) can pass it through instead of collapsing to 500.
export class GeminiApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GeminiApiError'
    this.status = status
  }
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

export async function getGeminiReply(
  message: string,
  history: GeminiHistoryMessage[],
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiConfigError()
  }

  const contents = [
    ...history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]

  const { status, data } = await callGeminiWithRetry(apiKey, contents)

  if (status < 200 || status >= 300) {
    console.error(`[gemini] request failed — status ${status}, model ${GEMINI_MODEL}:`, data?.error)
    throw new GeminiApiError(data?.error?.message ?? 'Gemini API 요청에 실패했어요.', status)
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  return text || '답변을 생성하지 못했어요. 다시 시도해주세요.'
}
