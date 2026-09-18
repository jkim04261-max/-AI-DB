// Overridable via env in case Google retires/renames this model again —
// `gemini-flash-latest` is Google's stable alias that always resolves to
// their current default flash model, so it doesn't need to be updated by hand.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const TEXT_REQUEST_TIMEOUT_MS = 18_000
// Multimodal (image) requests take Gemini noticeably longer to process than
// plain text — 20s was still getting hit in production ("[제미니] 시도 1/2에서
// 시간 초과"), so this gives image requests real headroom. A timeout doesn't
// get retried (see the AbortError branch below), so this is also the actual
// worst-case wait for a request that never times out.
const IMAGE_REQUEST_TIMEOUT_MS = 35_000
const MAX_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 500

// User-facing message for failures that are Gemini/network being slow or
// briefly unavailable, not a problem with the request itself — shown
// instead of a raw error like "This operation was aborted" (AbortError's
// message) or an upstream 5xx body.
const TRANSIENT_FAILURE_MESSAGE = '일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.'

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

// Classifies a thrown fetch error so logs say *why* the call failed instead
// of just dumping the raw Error object — "timeout" (our own AbortController
// firing), "network" (DNS/connection/TLS failures, tagged with Node's error
// code when fetch's undici backend exposes one via `cause`), or "unknown"
// for anything else.
function describeGeminiFailure(err: unknown): { kind: 'timeout' | 'network' | 'unknown'; detail: string } {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', detail: err.message }
  }
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code?: unknown }).code) : undefined
  const detail = [
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    causeCode ? `code=${causeCode}` : undefined,
    cause instanceof Error ? `cause=${cause.name}: ${cause.message}` : undefined,
  ]
    .filter(Boolean)
    .join(' | ')
  return { kind: causeCode ? 'network' : 'unknown', detail }
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
    const startedAt = Date.now()

    try {
      const geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        // Gemini 2.5 models "think" before answering by default, which can add
        // many seconds of latency even for simple prompts — this is a chat
        // UI where users expect a fast reply, not a reasoning budget, so
        // thinking is disabled outright.
        body: JSON.stringify({
          contents,
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      })

      const data = (await geminiRes.json()) as GeminiCallResult['data']
      const elapsedMs = Date.now() - startedAt

      // Retry on rate limiting / transient server errors, not on 4xx like
      // bad request or bad API key.
      const isRetryable = geminiRes.status === 429 || geminiRes.status >= 500
      if (!geminiRes.ok && isRetryable && attempt < MAX_ATTEMPTS) {
        console.error(
          `[gemini] attempt ${attempt}/${MAX_ATTEMPTS} failed — HTTP ${geminiRes.status} (${elapsedMs}ms, model=${GEMINI_MODEL}), retrying:`,
          data?.error?.message ?? data,
        )
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
        continue
      }
      if (!geminiRes.ok) {
        console.error(
          `[gemini] attempt ${attempt}/${MAX_ATTEMPTS} failed — HTTP ${geminiRes.status} (${elapsedMs}ms, model=${GEMINI_MODEL}), not retrying (${isRetryable ? 'out of attempts' : 'non-retryable status'}):`,
          data?.error?.message ?? data,
        )
      }

      return { status: geminiRes.status, data }
    } catch (err) {
      lastError = err
      const elapsedMs = Date.now() - startedAt
      const { kind, detail } = describeGeminiFailure(err)
      console.error(
        `[gemini] attempt ${attempt}/${MAX_ATTEMPTS} threw — kind=${kind} (${elapsedMs}ms of ${timeoutMs}ms budget, model=${GEMINI_MODEL}): ${detail}`,
      )
      // A timeout means Gemini already used its full budget without
      // responding — retrying would just wait the same amount again and
      // double the user's wait for no benefit. Only retry on errors that
      // fail fast (network glitches, DNS issues, etc.).
      if (kind === 'timeout') {
        throw new GeminiApiError(TRANSIENT_FAILURE_MESSAGE, 504)
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  // Every attempt threw a non-timeout error (network glitch, DNS issue,
  // etc.) — the raw error (e.g. a TypeError's message) isn't something a
  // user should see, so surface the same friendly message as a timeout.
  const { kind, detail } = describeGeminiFailure(lastError)
  console.error(`[gemini] all ${MAX_ATTEMPTS} attempts failed — last failure kind=${kind}: ${detail}`)
  throw new GeminiApiError(TRANSIENT_FAILURE_MESSAGE, 502)
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
    // callGeminiWithRetry already logged this attempt's failure in detail
    // (status, elapsed time, model, retryability) — 429/5xx means Gemini
    // itself was overloaded or briefly unavailable, which is the same "try
    // again shortly" story as a timeout, so use the same friendly message
    // rather than surfacing Google's raw error text.
    const message =
      status === 429 || status >= 500 ? TRANSIENT_FAILURE_MESSAGE : (data?.error?.message ?? 'Gemini API 요청에 실패했어요.')
    throw new GeminiApiError(message, status)
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  return text || '답변을 생성하지 못했어요. 다시 시도해주세요.'
}
