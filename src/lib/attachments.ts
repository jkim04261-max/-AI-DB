// Shared with the backend — keep these in sync with:
//  - ALLOWED_ATTACHMENT_MIME_TYPES / MAX_ATTACHMENTS_PER_MESSAGE / MAX_ATTACHMENT_BYTES
//    / MAX_TOTAL_ATTACHMENT_BYTES in api/conversations/[id].ts
//  - the upload-time limit in api/blob/upload.ts
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_FILE_COUNT = 5
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // per file
export const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024 // combined, to stay under Gemini's inline payload cap
