// Overridable via env in case Google retires/renames this model again —
// `gemini-flash-latest` is Google's stable alias that always resolves to
// their current default flash model, so it doesn't need to be updated by hand.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const TEXT_REQUEST_TIMEOUT_MS = 10_000
// Multimodal (image) requests take Gemini noticeably longer to process than
// plain text, so they get a longer per-attempt budget.
const IMAGE_REQUEST_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 500

export interface GeminiHistoryMessage {
  role: 'user' | 'ai'
  text: string
}

export interface GeminiImageAttachment {
  mimeType: string
  /** Base64-encoded image bytes (no data: URL prefix). */
  data: string
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

async function callGeminiWithRetry(
  apiKey: string,
  contents: unknown,
  timeoutMs: number,
): Promise<GeminiCallResult> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

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
        (err as { cause?: unknown } | undefined)?.cause,
      )
      // A timeout means Gemini already used its full budget without
      // responding — retrying would just wait the same amount again and
      // double the user's wait for no benefit. Only retry on errors that
      // fail fast (network glitches, DNS issues, etc.).
      if (isTimeout) {
        throw err
      }
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
  attachment?: GeminiImageAttachment,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiConfigError()
  }

  // The attachment only rides along on the turn it was sent — past turns in
  // `history` are text-only (see api/conversations/[id].ts), so a
  // conversation's image doesn't get re-uploaded to Gemini on every
  // follow-up message.
  const lastParts: Array<{ text: string } | { inlineData: GeminiImageAttachment }> = []
  if (message) {
    lastParts.push({ text: message })
  }
  if (attachment) {
    lastParts.push({ inlineData: attachment })
  }

  const contents = [
    ...history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: lastParts },
  ]

  const timeoutMs = attachment ? IMAGE_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS
  const { status, data } = await callGeminiWithRetry(apiKey, contents, timeoutMs)

  if (status < 200 || status >= 300) {
    console.error(`[gemini] request failed — status ${status}, model ${GEMINI_MODEL}:`, data?.error)
    throw new GeminiApiError(data?.error?.message ?? 'Gemini API 요청에 실패했어요.', status)
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  return text || '답변을 생성하지 못했어요. 다시 시도해주세요.'
}
