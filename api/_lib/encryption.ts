import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// 지시서(개인 마스터 DB 소유자 통제 및 보안 시스템) 3번: "민감한 개인
// 정보(이름, 연락처 등)는 DB 저장 시 암호화(Hashing/Encryption)하여
// 저장하세요" — 지금 누리AI는 로그인 식별자인 이메일(평문 조회가
// 필요해 암호화 대상에서 제외 — 아이디로 쓰이는 값이라 암호화하면
// 로그인 시 WHERE email = ... 조회 자체가 안 된다)과 비밀번호(이미
// bcrypt 해시)를 빼면 "이름/전화번호" 같은 개인정보 필드를 아예
// 수집하지 않는다(src/pages/PrivacyPage.tsx의 "현재 누리AI는 실명,
// 전화번호, 주소, 결제 정보 등은 수집하지 않습니다" 참고) — 그래서
// 지금 당장 이 함수로 암호화해 저장할 실제 필드는 없다. 이 유틸은
// 그런 필드(예: 향후 프로필에 실명·연락처가 추가될 때)가 생기는 즉시
// 바로 쓸 수 있도록 미리 준비해 둔다.
//
// AES-256-GCM: 대칭키 하나(ENCRYPTION_KEY, 32바이트를 base64로 인코딩한
// 값)로 암호화하고, 매번 새 IV(12바이트)를 생성해 같은 평문이라도
// 암호문이 매번 달라지게 한다. 인증 태그(authTag)까지 같이 저장해,
// 복호화 시 데이터가 변조되지 않았는지도 함께 검증한다(위조된 암호문은
// decryptPII가 바로 에러를 던진다).
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('ENCRYPTION_KEY_MISSING')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY_INVALID_LENGTH')
  }
  return key
}

// 평문을 암호화해 base64 문자열 하나로 돌려준다(IV + 인증 태그 + 암호문을
// 이어붙인 것) — DB 컬럼 하나에 그대로 저장할 수 있는 형태다.
export function encryptPII(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

// encryptPII가 만든 문자열을 원래 평문으로 되돌린다. 키가 다르거나
// 데이터가 변조됐으면(인증 태그 불일치) 에러를 던진다 — 호출부가
// 그 에러를 잡아 "복호화 실패"로 처리해야 한다.
export function decryptPII(ciphertext: string): string {
  const key = getKey()
  const raw = Buffer.from(ciphertext, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
