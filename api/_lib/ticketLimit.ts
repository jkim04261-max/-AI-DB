import { sql, ensureUsersTable } from './db'

// 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 만능마켓의 "AI 추천
// 충전권"/"지식 검증 충전권"을 사서 쌓이는 계정 단위 이용권(users.
// ai_recommend_tickets/knowledge_validation_tickets) — reserveTeach/
// reserveStudy(knowledgeLimit.ts/studyLimit.ts)가 지키는 하루 무료
// 한도가 바닥났을 때만 대신 이걸 하나씩 깎아 "한 번 더" 쓰게 해준다.
// 하루 한도와 완전히 별개의 컬럼·코드 경로이고, 자정이 지나도 리셋되지
// 않는다(산 만큼 그대로 남는다) — 사용자 지시("구매한 티켓 수량...이
// 분리되어 관리되는지 확인")에 따른 설계.
export interface TicketBalances {
  aiRecommendTickets: number
  knowledgeValidationTickets: number
}

export interface ConsumeTicketResult {
  ok: boolean
  // ok=true일 때: 이번 소비 *이후* 남은 수량. ok=false일 때: 항상 0.
  remaining: number
}

// PR #49 계열(peekTeachUsage/peekStudyUsage)과 같은 "소비 없는 조회" —
// 가르치기 패널을 열 때마다 최신 값을 보여주는 데 쓴다.
export async function peekTickets(userId: number): Promise<TicketBalances> {
  await ensureUsersTable()

  const result = await sql<{ ai_recommend_tickets: number; knowledge_validation_tickets: number }>`
    SELECT ai_recommend_tickets, knowledge_validation_tickets FROM users WHERE id = ${userId}
  `
  const row = result.rows[0]
  return {
    aiRecommendTickets: row?.ai_recommend_tickets ?? 0,
    knowledgeValidationTickets: row?.knowledge_validation_tickets ?? 0,
  }
}

// reserveTeach/reserveStudy와 같은 원자적 "검사 후 감소" 1문장 UPDATE —
// 동시에 두 요청이 들어와도 보유량보다 더 많이 깎이지 않는다.
export async function consumeAiRecommendTicket(userId: number): Promise<ConsumeTicketResult> {
  await ensureUsersTable()

  const result = await sql<{ ai_recommend_tickets: number }>`
    UPDATE users
    SET ai_recommend_tickets = ai_recommend_tickets - 1
    WHERE id = ${userId} AND ai_recommend_tickets > 0
    RETURNING ai_recommend_tickets
  `
  const row = result.rows[0]
  if (!row) return { ok: false, remaining: 0 }
  return { ok: true, remaining: row.ai_recommend_tickets }
}

// refundTeach/refundStudy와 같은 이유 — Gemini 호출 자체가 실패했거나
// 대화 저장에 실패해서 이번 시도가 "쓸 수 있는 결과"를 전혀 내지
// 못했을 때만 호출한다. 성공적으로 응답을 받았다면(appropriate/
// needs_revision/unverifiable 무엇이든) 환불하지 않는다.
export async function refundAiRecommendTicket(userId: number): Promise<void> {
  await ensureUsersTable()

  await sql`
    UPDATE users
    SET ai_recommend_tickets = ai_recommend_tickets + 1
    WHERE id = ${userId}
  `
}

export async function consumeKnowledgeValidationTicket(userId: number): Promise<ConsumeTicketResult> {
  await ensureUsersTable()

  const result = await sql<{ knowledge_validation_tickets: number }>`
    UPDATE users
    SET knowledge_validation_tickets = knowledge_validation_tickets - 1
    WHERE id = ${userId} AND knowledge_validation_tickets > 0
    RETURNING knowledge_validation_tickets
  `
  const row = result.rows[0]
  if (!row) return { ok: false, remaining: 0 }
  return { ok: true, remaining: row.knowledge_validation_tickets }
}

export async function refundKnowledgeValidationTicket(userId: number): Promise<void> {
  await ensureUsersTable()

  await sql`
    UPDATE users
    SET knowledge_validation_tickets = knowledge_validation_tickets + 1
    WHERE id = ${userId}
  `
}

// 만능마켓 구매(purchase-ai-recommend-ticket/purchase-knowledge-
// validation-ticket 액션)에서만 호출한다 — exampleDraftsLimit.ts와 같은
// 원칙으로, 클라이언트가 보낸 수량은 신뢰하지 않고 호출부(api/
// character.ts)가 항상 amount=1을 고정해서 넘긴다. 두 이용권 수량을
// 함께 RETURNING해서, 구매 직후 응답 하나로 양쪽 잔액을 전부 최신
// 상태로 동기화할 수 있게 한다(새로고침·별도 재조회 불필요).
export async function addAiRecommendTickets(userId: number, amount: number): Promise<TicketBalances> {
  await ensureUsersTable()

  const result = await sql<{ ai_recommend_tickets: number; knowledge_validation_tickets: number }>`
    UPDATE users
    SET ai_recommend_tickets = ai_recommend_tickets + ${amount}
    WHERE id = ${userId}
    RETURNING ai_recommend_tickets, knowledge_validation_tickets
  `
  const row = result.rows[0]
  return {
    aiRecommendTickets: row?.ai_recommend_tickets ?? 0,
    knowledgeValidationTickets: row?.knowledge_validation_tickets ?? 0,
  }
}

export async function addKnowledgeValidationTickets(userId: number, amount: number): Promise<TicketBalances> {
  await ensureUsersTable()

  const result = await sql<{ ai_recommend_tickets: number; knowledge_validation_tickets: number }>`
    UPDATE users
    SET knowledge_validation_tickets = knowledge_validation_tickets + ${amount}
    WHERE id = ${userId}
    RETURNING ai_recommend_tickets, knowledge_validation_tickets
  `
  const row = result.rows[0]
  return {
    aiRecommendTickets: row?.ai_recommend_tickets ?? 0,
    knowledgeValidationTickets: row?.knowledge_validation_tickets ?? 0,
  }
}
