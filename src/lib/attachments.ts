// Shared with the backend — keep these in sync with:
//  - ALLOWED_ATTACHMENT_MIME_TYPES / MAX_ATTACHMENTS_PER_MESSAGE / MAX_ATTACHMENT_BYTES
//    / MAX_TOTAL_ATTACHMENT_BYTES in api/conversations/[id].ts
//  - the upload-time limit (ALLOWED_CONTENT_TYPES) in api/blob/upload.ts
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
// 지시서(첨부 파일 확장): 이미지 외에 PDF도 첨부할 수 있다. 한글/워드
// 문서(.doc/.docx)는 Gemini의 generateContent가 inlineData로 직접 받는
// MIME 타입이 아니라서(이미지·PDF·오디오·비디오만 지원) 제외했다 — 받아도
// Gemini가 내용을 읽지 못해 "첨부했는데 AI가 못 본" 것처럼 보이는 문제가
// 생긴다. 지원하려면 서버에서 텍스트를 먼저 추출하는 별도 파이프라인이
// 필요해 이번 범위 밖이다.
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf']
export const ALLOWED_ATTACHMENT_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]
export const MAX_FILE_COUNT = 10
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // per file
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024 // combined, to stay under Gemini's inline payload cap
