import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface HistoryMessage {
  role: 'user' | 'ai'
  text: string
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
      const message = data?.error?.message ?? 'Gemini API 요청에 실패했어요.'
      res.status(geminiRes.status).json({ error: message })
      return
    }

    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('') ?? ''

    res.status(200).json({ text: text || '답변을 생성하지 못했어요. 다시 시도해주세요.' })
  } catch {
    res.status(500).json({ error: 'Gemini 요청 중 오류가 발생했어요.' })
  }
}
