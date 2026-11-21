import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '../_lib/auth'

// 지시서(첨부 파일 확장): api/conversations/[id].ts의
// ALLOWED_ATTACHMENT_MIME_TYPES와 반드시 같은 목록이어야 한다 — 여기서
// 막힌 타입은 업로드 자체가 안 되므로, 둘 중 하나만 넓히면 업로드는
// 성공했는데 전송은 거부되는(또는 그 반대) 불일치가 생긴다.
const CHAT_ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
const CHAT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8MB

// 지시서(실제 업무·연구·비법·노하우 기록 시스템) 2번: "지식 기록장"
// 전용 업로드 규칙 — 채팅 첨부(위 CHAT_*)와는 완전히 별도다. 이 파일을
// 공유하는 이유는 기능이 비슷해서가 아니라, Vercel Hobby 플랜 12개
// 서버리스 함수 한도(api/character.ts 상단 주석 참고) 때문에 새 함수
// 파일을 만들 수 없어서다 — onBeforeGenerateToken이 요청의
// clientPayload로 "어느 기능의 업로드인지"를 구분해 서로 다른 허용
// 타입/용량을 적용한다. src/data/knowledgeLogAttachments.ts와 반드시
// 같은 값이어야 한다.
const KNOWLEDGE_LOG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const KNOWLEDGE_LOG_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const KNOWLEDGE_LOG_MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB
const KNOWLEDGE_LOG_MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50MB

interface KnowledgeLogClientPayload {
  purpose: 'knowledge-log'
  kind: 'image' | 'video'
}

function parseKnowledgeLogPayload(raw: string | null): KnowledgeLogClientPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<KnowledgeLogClientPayload>
    if (parsed?.purpose === 'knowledge-log' && (parsed.kind === 'image' || parsed.kind === 'video')) {
      return { purpose: 'knowledge-log', kind: parsed.kind }
    }
  } catch {
    // malformed payload — fall through to the default (chat) rules below
  }
  return null
}

// 지시서 2번: "악성 파일 검사 — 실행 파일(.exe, .bat 등)은 차단" — MIME
// 타입 허용 목록(allowedContentTypes)만으로도 사실상 막히지만(브라우저가
// 보고하는 MIME이 이 목록에 없으면 업로드 토큰 자체가 안 나온다), 파일
// 이름을 사용자가 임의로 꾸밀 수 있는 걸 감안해 확장자도 한 번 더
// 직접 막는다 — 채팅/지식 기록장 업로드 모두에 똑같이 적용되는
// 방어 계층이다.
const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.sh', '.js', '.vbs', '.ps1', '.scr', '.jar', '.app']

function hasDangerousExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return DANGEROUS_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

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
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (hasDangerousExtension(pathname)) {
          throw new Error('허용되지 않는 파일 형식이에요.')
        }
        const knowledgeLogPayload = parseKnowledgeLogPayload(clientPayload)
        if (knowledgeLogPayload) {
          return {
            allowedContentTypes: [...KNOWLEDGE_LOG_IMAGE_TYPES, ...KNOWLEDGE_LOG_VIDEO_TYPES],
            maximumSizeInBytes: knowledgeLogPayload.kind === 'video' ? KNOWLEDGE_LOG_MAX_VIDEO_BYTES : KNOWLEDGE_LOG_MAX_IMAGE_BYTES,
            addRandomSuffix: true,
          }
        }
        return {
          allowedContentTypes: CHAT_ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: CHAT_MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        }
      },
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
