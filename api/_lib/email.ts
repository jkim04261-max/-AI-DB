// Resend's HTTP API is a single plain POST, so this calls it with fetch
// directly instead of adding the `resend` npm package as a dependency —
// same approach api/_lib/gemini.ts takes for the Gemini API.
const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = '누리AI <onboarding@resend.dev>'
const REQUEST_TIMEOUT_MS = 10_000

// Thrown when RESEND_API_KEY isn't configured, mirroring GeminiConfigError
// in gemini.ts so callers can tell "server misconfigured" apart from
// "Resend rejected/failed the request".
export class EmailConfigError extends Error {
  constructor() {
    super('RESEND_API_KEY_MISSING')
    this.name = 'EmailConfigError'
  }
}

// Thrown on anything else that means the email did not go out — a non-2xx
// from Resend, a timeout, or a network failure. Callers must not report
// success to the user when this is thrown.
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailSendError'
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new EmailConfigError()
  }
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: '[누리AI] 비밀번호 재설정',
        html: `
          <p>안녕하세요, 누리AI입니다.</p>
          <p>아래 링크를 눌러 비밀번호를 재설정해주세요. 이 링크는 30분 동안만 유효하고, 한 번 사용하면 다시 쓸 수 없어요.</p>
          <p><a href="${resetUrl}">비밀번호 재설정하기</a></p>
          <p>본인이 요청하지 않았다면 이 메일을 무시하셔도 괜찮아요.</p>
        `,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      // Log only the HTTP status and Resend's own error body — never the
      // API key (not even indirectly via request headers) and never the
      // raw reset token (resetUrl is the one place it appears, and it's
      // already been sent to the one place it needs to go).
      const body = await res.text().catch(() => '')
      console.error(`[email] Resend request failed — HTTP ${res.status}: ${body.slice(0, 500)}`)
      throw new EmailSendError(`RESEND_HTTP_${res.status}`)
    }
  } catch (err) {
    if (err instanceof EmailSendError) throw err
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error(`[email] Resend request threw: ${detail}`)
    throw new EmailSendError('RESEND_REQUEST_FAILED')
  } finally {
    clearTimeout(timeout)
  }
}
