import { sql } from './db'

// 지시서(AI 예시문 3개 자동 생성 기능 복구): "캐릭터당 평생 3번 무료"
// (사용자 승인) — daily_teach_usage/daily_study_usage(하루마다 리셋,
// api/_lib/knowledgeLimit.ts·studyLimit.ts)와 달리 리셋되지 않는 값이라
// 별도 usage 테이블이 아니라 characters.example_drafts_free_used에 직접
// 쌓는다(ensureCharacterTables, api/_lib/db.ts). 무료 3번을 다 쓰면
// characters.example_drafts_paid_credits(만능마켓 "AI 추천 충전권" 구매로
// 쌓이는 실제 DB 영속 크레딧)를 쓴다 — 둘 다 소진되면 생성할 수 없다.
export const FREE_EXAMPLE_DRAFTS_LIMIT = 3

export interface ReserveExampleDraftResult {
  ok: boolean
  // ok=true일 때 이번 요청이 무료/유료 중 어느 쪽을 소비했는지 — Gemini
  // 호출이 실패하면 refundExampleDraft가 정확히 이 값으로 되돌려야 한다.
  usedFree: boolean
  freeRemaining: number
  paidCredits: number
}

// reserveTeach/reserveStudy와 같은 "검사 후 증가를 한 문장으로" 원자적
// 패턴을 그대로 쓴다 — 먼저 무료를 한 문장으로 소비 시도하고, 그 UPDATE가
// 0행을 돌려주면(무료 소진) 유료 크레딧을 또 한 문장으로 소비 시도한다.
// 두 문장 모두 각각 원자적이라, 동시 요청이 와도 이중 차감되지 않는다
// (지시서 "중복 결제와 중복 이용권 차감 방지").
export async function reserveExampleDraft(userId: number, characterId: number): Promise<ReserveExampleDraftResult> {
  const freeResult = await sql<{ example_drafts_free_used: number; example_drafts_paid_credits: number }>`
    UPDATE characters
    SET example_drafts_free_used = example_drafts_free_used + 1
    WHERE id = ${characterId} AND user_id = ${userId} AND example_drafts_free_used < ${FREE_EXAMPLE_DRAFTS_LIMIT}
    RETURNING example_drafts_free_used, example_drafts_paid_credits
  `
  const freeRow = freeResult.rows[0]
  if (freeRow) {
    return {
      ok: true,
      usedFree: true,
      freeRemaining: FREE_EXAMPLE_DRAFTS_LIMIT - freeRow.example_drafts_free_used,
      paidCredits: freeRow.example_drafts_paid_credits,
    }
  }

  const paidResult = await sql<{ example_drafts_free_used: number; example_drafts_paid_credits: number }>`
    UPDATE characters
    SET example_drafts_paid_credits = example_drafts_paid_credits - 1
    WHERE id = ${characterId} AND user_id = ${userId} AND example_drafts_paid_credits > 0
    RETURNING example_drafts_free_used, example_drafts_paid_credits
  `
  const paidRow = paidResult.rows[0]
  if (paidRow) {
    return { ok: true, usedFree: false, freeRemaining: 0, paidCredits: paidRow.example_drafts_paid_credits }
  }

  // 둘 다 소진 — 지금 실제 남은 값을 그대로 보고한다(디스플레이용).
  const current = await sql<{ example_drafts_free_used: number; example_drafts_paid_credits: number }>`
    SELECT example_drafts_free_used, example_drafts_paid_credits FROM characters
    WHERE id = ${characterId} AND user_id = ${userId}
  `
  const row = current.rows[0]
  return {
    ok: false,
    usedFree: false,
    freeRemaining: row ? Math.max(0, FREE_EXAMPLE_DRAFTS_LIMIT - row.example_drafts_free_used) : 0,
    paidCredits: row?.example_drafts_paid_credits ?? 0,
  }
}

// Gemini 호출 자체가 실패했을 때(설정/타임아웃/네트워크/비2xx나 응답
// 해석 실패) 방금 reserveExampleDraft가 소비한 쪽을 정확히 되돌린다 —
// handleVerifyKnowledge/handleGenerateStudy와 같은 "쓸 수 있는 결과가
// 없으면 오늘(이번) 한도에서 제외한다" 회계 원칙(지시서 "API 실패 시
// 유료 이용권을 소비하지 않도록 처리" — 무료도 같은 원칙으로 보호한다).
export async function refundExampleDraft(userId: number, characterId: number, usedFree: boolean): Promise<void> {
  if (usedFree) {
    await sql`
      UPDATE characters
      SET example_drafts_free_used = example_drafts_free_used - 1
      WHERE id = ${characterId} AND user_id = ${userId} AND example_drafts_free_used > 0
    `
  } else {
    await sql`
      UPDATE characters
      SET example_drafts_paid_credits = example_drafts_paid_credits + 1
      WHERE id = ${characterId} AND user_id = ${userId}
    `
  }
}

// 만능마켓에서 "AI 추천 충전권"을 가상용돈으로 구매한 직후 호출된다 —
// 가상용돈 차감은 체험판(새로고침 시 초기화)이지만, 이 크레딧만큼은
// 실제 DB에 영속한다(사용자 승인). amount는 항상 1이지만(한 번에 1개씩
// 구매), 나중에 "3개 묶음 구매" 같은 상품이 생길 걸 대비해 매개변수로
// 둔다.
export async function grantExampleDraftCredits(userId: number, characterId: number, amount: number): Promise<number> {
  const result = await sql<{ example_drafts_paid_credits: number }>`
    UPDATE characters
    SET example_drafts_paid_credits = example_drafts_paid_credits + ${amount}
    WHERE id = ${characterId} AND user_id = ${userId}
    RETURNING example_drafts_paid_credits
  `
  return result.rows[0]?.example_drafts_paid_credits ?? 0
}
