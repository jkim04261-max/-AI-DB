const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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

  const geminiRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ contents }),
  })

  const data = (await geminiRes.json()) as {
    error?: { message?: string }
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }

  if (!geminiRes.ok) {
    throw new GeminiApiError(data?.error?.message ?? 'Gemini API 요청에 실패했어요.', geminiRes.status)
  }

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  return text || '답변을 생성하지 못했어요. 다시 시도해주세요.'
}
