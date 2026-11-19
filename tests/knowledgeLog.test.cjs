// Tests the "지식 기록장" (personal knowledge log) actions on
// api/character.ts (?action=knowledge-log / knowledge-log-save /
// knowledge-log-delete) added per 지시서(실제 업무·연구·비법·노하우
// 기록 시스템). These are completely independent of the AI
// companion(character) features the rest of this file's sibling tests
// cover — no companionType, no character row, no Gemini call at all —
// so this test needs none of knowledge.test.cjs's fetch/Gemini mocking.
const { bundle } = require('./bundle.cjs')
const { mockRes, cookieHeaderFor, Tracker } = require('./helpers.cjs')

const TRUSTED_URL = (name) => `https://abc123.public.blob.vercel-storage.com/knowledge-log/${name}`

async function run() {
  process.env.AUTH_SECRET = 'test-secret-for-ci-only'

  const mock = require('./setup-postgres-mock.cjs')
  const characterHandler = bundle('api/character.ts').default
  const auth = bundle('api/_lib/auth.ts')

  const t = new Tracker('knowledgeLog')

  mock.reset()
  mock.seedUser(1, { email: 'alice@test.com' })
  mock.seedUser(2, { email: 'bob@test.com' })
  const aliceCookie = cookieHeaderFor(auth, 1, 0, 'alice@test.com')
  const bobCookie = cookieHeaderFor(auth, 2, 0, 'bob@test.com')
  const aliceReq = (overrides = {}) => ({ headers: { cookie: aliceCookie }, query: {}, ...overrides })
  const bobReq = (overrides = {}) => ({ headers: { cookie: bobCookie }, query: {}, ...overrides })

  // 1) 처음에는 기록이 하나도 없다.
  const emptyList = mockRes()
  await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge-log' } }), emptyList)
  t.assert(emptyList.statusCode === 200, '목록 조회는 항상 200이다')
  t.assert(Array.isArray(emptyList.body.entries) && emptyList.body.entries.length === 0, '처음에는 기록이 없다')

  // 2) 유효성 검증: 날짜/카테고리/내용.
  const badDate = mockRes()
  await characterHandler(
    aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { entryDate: '2026-13-99', category: 'work_log', content: '내용' } }),
    badDate,
  )
  t.assert(badDate.statusCode === 400, '잘못된 날짜 형식은 400이다')

  const badCategory = mockRes()
  await characterHandler(
    aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { entryDate: '2026-11-19', category: 'not-a-real-category', content: '내용' } }),
    badCategory,
  )
  t.assert(badCategory.statusCode === 400, '허용되지 않은 카테고리는 400이다')

  const emptyContent = mockRes()
  await characterHandler(
    aliceReq({ method: 'POST', query: { action: 'knowledge-log-save' }, body: { entryDate: '2026-11-19', category: 'work_log', content: '   ' } }),
    emptyContent,
  )
  t.assert(emptyContent.statusCode === 400, '빈 내용은 400이다')

  const tooLongContent = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: { entryDate: '2026-11-19', category: 'work_log', content: 'x'.repeat(5001) },
    }),
    tooLongContent,
  )
  t.assert(tooLongContent.statusCode === 400, '5000자를 넘는 내용은 400이다')

  // 3) 최소 필드로 저장 — visibility를 안 주면 기본값 private, 나머지도
  // 안 주면 null/빈 배열이어야 한다.
  const minimalSave = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: { entryDate: '2026-11-19', category: 'tip', content: '첫 번째 꿀팁 기록입니다.' },
    }),
    minimalSave,
  )
  t.assert(minimalSave.statusCode === 200, '최소 필드만으로도 저장된다')
  t.assert(minimalSave.body.entry.visibility === 'private', 'visibility를 안 주면 기본값은 비공개(private)다')
  t.assert(minimalSave.body.entry.businessName === null && minimalSave.body.entry.tags === null, '선택 필드를 안 주면 null로 저장된다')
  t.assert(Array.isArray(minimalSave.body.entry.attachments) && minimalSave.body.entry.attachments.length === 0, '첨부가 없으면 빈 배열이다')
  const firstEntryId = minimalSave.body.entry.id

  // 4) 전체 필드 + 첨부 2개(사진/동영상)로 저장.
  const fullSave = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: {
        entryDate: '2026-11-18',
        businessName: '누리상사',
        category: 'success_case',
        tags: '계약,신규고객',
        content: '신규 고객과 계약을 성공적으로 체결했다.',
        visibility: 'public',
        attachments: [
          { url: TRUSTED_URL('photo.jpg'), mimeType: 'image/jpeg', name: 'photo.jpg' },
          { url: TRUSTED_URL('clip.mp4'), mimeType: 'video/mp4', name: 'clip.mp4' },
        ],
      },
    }),
    fullSave,
  )
  t.assert(fullSave.statusCode === 200, '전체 필드 + 첨부로도 저장된다')
  t.assert(fullSave.body.entry.businessName === '누리상사' && fullSave.body.entry.visibility === 'public', '입력한 값이 그대로 저장된다')
  t.assert(fullSave.body.entry.attachments.length === 2, '첨부 2개가 그대로 저장된다')
  t.assert(fullSave.body.entry.attachments[0].mimeType === 'image/jpeg' && fullSave.body.entry.attachments[1].mimeType === 'video/mp4', '첨부 순서/타입이 유지된다')
  const secondEntryId = fullSave.body.entry.id

  // 5) 악성 파일/허용되지 않은 MIME은 차단된다(.exe 등은 애초에 Blob
  // 업로드 단계(api/blob/upload.ts)에서 막히지만, 혹시 그 토큰 체계를
  // 건너뛰고 직접 저장 API를 호출해도 서버가 다시 한 번 막는다).
  const badMime = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: {
        entryDate: '2026-11-19',
        category: 'work_log',
        content: '악성 파일 테스트',
        attachments: [{ url: TRUSTED_URL('virus.exe'), mimeType: 'application/x-msdownload', name: 'virus.exe' }],
      },
    }),
    badMime,
  )
  t.assert(badMime.statusCode === 400, '허용되지 않은 MIME 타입(실행 파일 등)은 저장 시점에도 차단된다')

  // 6) 믿을 수 없는(우리 Blob 스토어가 아닌) URL도 차단된다 — SSRF/임의
  // 링크 저장소 악용 방지.
  const untrustedUrl = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: {
        entryDate: '2026-11-19',
        category: 'work_log',
        content: '외부 URL 테스트',
        attachments: [{ url: 'https://evil.example.com/photo.jpg', mimeType: 'image/jpeg', name: 'photo.jpg' }],
      },
    }),
    untrustedUrl,
  )
  t.assert(untrustedUrl.statusCode === 400, '우리 Blob 스토어가 아닌 URL은 차단된다')

  // 7) 첨부는 최대 5개까지만 허용된다.
  const tooManyAttachments = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: {
        entryDate: '2026-11-19',
        category: 'work_log',
        content: '첨부 6개 테스트',
        attachments: Array.from({ length: 6 }, (_, i) => ({ url: TRUSTED_URL(`p${i}.jpg`), mimeType: 'image/jpeg', name: `p${i}.jpg` })),
      },
    }),
    tooManyAttachments,
  )
  t.assert(tooManyAttachments.statusCode === 400, '첨부 6개는 최대 5개 제한에 걸려 400이다')

  // 8) 목록 조회 — 최신(entry_date 내림차순)이 먼저 와야 한다.
  const listAfterTwoSaves = mockRes()
  await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge-log' } }), listAfterTwoSaves)
  t.assert(listAfterTwoSaves.body.entries.length === 2, '저장한 2개가 모두 조회된다')
  t.assert(listAfterTwoSaves.body.entries[0].id === firstEntryId, '더 최근 날짜(2026-11-19)인 첫 번째 기록이 먼저 온다')

  // 9) 수정 — id를 포함해 다시 저장하면 새로 추가되지 않고 기존 행이
  // 업데이트된다. 첨부도 통째로 교체된다(기존 2개 → 1개로 줄어듦).
  const editSave = mockRes()
  await characterHandler(
    aliceReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: {
        id: secondEntryId,
        entryDate: '2026-11-18',
        category: 'failure_case',
        content: '수정된 내용 — 실패 사례로 다시 분류',
        visibility: 'partial',
        attachments: [{ url: TRUSTED_URL('photo2.jpg'), mimeType: 'image/jpeg', name: 'photo2.jpg' }],
      },
    }),
    editSave,
  )
  t.assert(editSave.statusCode === 200, '수정도 200이다')
  t.assert(editSave.body.entry.id === secondEntryId, '같은 id로 수정된다(새로 생기지 않는다)')
  t.assert(editSave.body.entry.category === 'failure_case' && editSave.body.entry.visibility === 'partial', '수정한 값이 반영된다')
  t.assert(editSave.body.entry.attachments.length === 1, '첨부가 통째로 교체되어 1개만 남는다')

  const listAfterEdit = mockRes()
  await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge-log' } }), listAfterEdit)
  t.assert(listAfterEdit.body.entries.length === 2, '수정은 개수를 바꾸지 않는다(여전히 2개)')

  // 10) 소유권 — 다른 유저(bob)는 alice의 기록을 수정/삭제할 수 없다.
  const bobEditAttempt = mockRes()
  await characterHandler(
    bobReq({
      method: 'POST',
      query: { action: 'knowledge-log-save' },
      body: { id: firstEntryId, entryDate: '2026-11-19', category: 'tip', content: 'bob이 가로채려는 수정' },
    }),
    bobEditAttempt,
  )
  t.assert(bobEditAttempt.statusCode === 404, '다른 유저는 남의 기록을 수정할 수 없다(404)')

  const bobDeleteAttempt = mockRes()
  await characterHandler(bobReq({ method: 'POST', query: { action: 'knowledge-log-delete' }, body: { id: firstEntryId } }), bobDeleteAttempt)
  t.assert(bobDeleteAttempt.statusCode === 404, '다른 유저는 남의 기록을 삭제할 수 없다(404)')

  const bobList = mockRes()
  await characterHandler(bobReq({ method: 'GET', query: { action: 'knowledge-log' } }), bobList)
  t.assert(bobList.body.entries.length === 0, '유저별로 완전히 분리된 목록이다 — bob에게는 alice의 기록이 안 보인다')

  // 11) 삭제 — 소유자 본인은 삭제할 수 있고, 첨부도 함께 사라진다.
  const deleteRes = mockRes()
  await characterHandler(aliceReq({ method: 'POST', query: { action: 'knowledge-log-delete' }, body: { id: secondEntryId } }), deleteRes)
  t.assert(deleteRes.statusCode === 200, '본인 기록은 삭제할 수 있다')
  t.assert(
    mock.state.personalKnowledgeLogAttachments.filter((a) => a.log_id === secondEntryId).length === 0,
    '기록을 삭제하면 그 첨부 행도 함께 삭제된다(ON DELETE CASCADE)',
  )

  const listAfterDelete = mockRes()
  await characterHandler(aliceReq({ method: 'GET', query: { action: 'knowledge-log' } }), listAfterDelete)
  t.assert(listAfterDelete.body.entries.length === 1 && listAfterDelete.body.entries[0].id === firstEntryId, '삭제한 기록만 사라지고 나머지는 그대로다')

  // 12) 삭제 핸들러도 id가 숫자가 아니면 400이다(잘못된 요청).
  const badDeleteBody = mockRes()
  await characterHandler(aliceReq({ method: 'POST', query: { action: 'knowledge-log-delete' }, body: {} }), badDeleteBody)
  t.assert(badDeleteBody.statusCode === 400, 'id 없는 삭제 요청은 400이다')

  return t.summary()
}

module.exports = { run }
