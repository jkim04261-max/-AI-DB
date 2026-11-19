// Tests api/_lib/encryption.ts — the AES-256-GCM PII encryption utility
// added per 지시서(개인 마스터 DB 소유자 통제 및 보안 시스템) 3번.
// No handler uses this yet (see that file's own comment for why — 누리AI
// doesn't collect a name/phone-style field today), so this tests the
// utility directly rather than through an API handler.
const crypto = require('crypto')
const { bundle } = require('./bundle.cjs')
const { Tracker } = require('./helpers.cjs')

function run() {
  const t = new Tracker('encryption')
  const encryption = bundle('api/_lib/encryption.ts')

  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')

  // 1) 기본 왕복 — 암호화한 걸 그대로 복호화하면 원래 평문이 나온다.
  {
    const plaintext = '홍길동, 010-1234-5678'
    const ciphertext = encryption.encryptPII(plaintext)
    t.assert(typeof ciphertext === 'string' && ciphertext.length > 0, '암호화 결과는 비어있지 않은 문자열이다')
    t.assert(ciphertext !== plaintext, '암호문은 평문과 다르다(평문 그대로 저장되지 않음)')
    t.assert(encryption.decryptPII(ciphertext) === plaintext, '복호화하면 원래 평문과 정확히 같다')
  }

  // 2) 같은 평문도 매번 다른 암호문을 만든다(IV가 매번 새로 생성되어서) —
  // 같은 이름을 가진 두 사람의 암호문을 비교해도 평문이 같다는 걸 알 수
  // 없어야 한다.
  {
    const a = encryption.encryptPII('같은 내용')
    const b = encryption.encryptPII('같은 내용')
    t.assert(a !== b, '같은 평문을 두 번 암호화해도 암호문은 매번 다르다(IV 랜덤화)')
    t.assert(encryption.decryptPII(a) === '같은 내용' && encryption.decryptPII(b) === '같은 내용', '둘 다 올바르게 복호화된다')
  }

  // 3) 빈 문자열도 왕복된다.
  {
    const ciphertext = encryption.encryptPII('')
    t.assert(encryption.decryptPII(ciphertext) === '', '빈 문자열도 암호화/복호화할 수 있다')
  }

  // 4) 변조된 암호문은 복호화 시 에러를 던진다(인증 태그 검증 실패) —
  // 누가 DB의 암호문을 직접 바꿔도 조용히 틀린 값이 나오는 게 아니라
  // 반드시 실패해야 한다.
  {
    const ciphertext = encryption.encryptPII('원본 내용')
    const tampered = Buffer.from(ciphertext, 'base64')
    tampered[tampered.length - 1] ^= 0xff // 암호문의 마지막 바이트를 뒤집는다
    let threw = false
    try {
      encryption.decryptPII(tampered.toString('base64'))
    } catch {
      threw = true
    }
    t.assert(threw, '변조된 암호문을 복호화하려 하면 에러가 난다(조용히 틀린 평문을 내놓지 않는다)')
  }

  // 5) 다른 키로 복호화하면 실패한다 — 키가 바뀌면(또는 틀리면) 기존
  // 암호문을 아무도(관리자 포함) 읽을 수 없다는 걸 확인한다.
  {
    const ciphertext = encryption.encryptPII('비밀 정보')
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
    let threw = false
    try {
      encryption.decryptPII(ciphertext)
    } catch {
      threw = true
    }
    t.assert(threw, '암호화할 때와 다른 키로는 복호화할 수 없다')
  }

  // 6) 키가 설정되지 않았으면 암호화/복호화 자체가 안 된다(평문으로
  // 조용히 새는 fallback이 없다).
  {
    delete process.env.ENCRYPTION_KEY
    let threw = false
    try {
      encryption.encryptPII('아무 내용')
    } catch {
      threw = true
    }
    t.assert(threw, 'ENCRYPTION_KEY가 없으면 암호화를 시도조차 하지 않고 에러를 던진다(평문 저장 fallback 없음)')
  }

  return t.summary()
}

module.exports = { run }
