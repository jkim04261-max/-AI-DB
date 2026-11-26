// 지시서(실제 업무·연구·비법·노하우 기록 시스템) 2번: "지식 기록장"
// 전용 첨부 규칙 — src/lib/attachments.ts(채팅 첨부)와는 완전히 별도다.
// 반드시 api/blob/upload.ts의 KNOWLEDGE_LOG_* 상수와 같은 값이어야
// 한다.
export const KNOWLEDGE_LOG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const KNOWLEDGE_LOG_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const KNOWLEDGE_LOG_ATTACHMENT_TYPES = [...KNOWLEDGE_LOG_IMAGE_TYPES, ...KNOWLEDGE_LOG_VIDEO_TYPES]

export const MAX_KNOWLEDGE_LOG_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB
export const MAX_KNOWLEDGE_LOG_VIDEO_BYTES = 50 * 1024 * 1024 // 50MB
export const MAX_KNOWLEDGE_LOG_ATTACHMENTS = 5

export function knowledgeLogAttachmentKind(mimeType: string): 'image' | 'video' | null {
  if (KNOWLEDGE_LOG_IMAGE_TYPES.includes(mimeType)) return 'image'
  if (KNOWLEDGE_LOG_VIDEO_TYPES.includes(mimeType)) return 'video'
  return null
}

export function maxBytesForKind(kind: 'image' | 'video'): number {
  return kind === 'video' ? MAX_KNOWLEDGE_LOG_VIDEO_BYTES : MAX_KNOWLEDGE_LOG_IMAGE_BYTES
}
