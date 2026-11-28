import { sql, ensureWalletTables } from './db'

// 서버 지갑(캐릭터별 가상 용돈). 모든 금액은 가상 용돈이며 현금·환전과 무관하다.
// 금액과 정답 판정은 전부 서버가 정한다 — 클라이언트는 "무슨 일이 일어났는지"만
// 보내고 금액은 보내지 않는다(예외: market_purchase, 아래 참고).

// 지시서(2026-11-28 긴급 수정: "식사·심부름 보상 및 패널티 실제 적용"):
// 기본값을 켬으로 바꾼다 — 새 테이블 3개(character_wallets 등)만 추가할
// 뿐 기존 테이블은 전혀 건드리지 않으므로(ensureWalletTables 참고),
// Preview와 운영이 같은 DB를 쓰더라도 기존 데이터에 위험이 없다. 필요
// 시에만 Vercel 환경변수 WALLET_API_ENABLED=false로 다시 끌 수 있다.
export function walletEnabled(): boolean {
  return process.env.WALLET_API_ENABLED !== 'false'
}

export const WALLET_INITIAL_WON = 100_000
export const QUIZ_CHALLENGE_STAKE_WON = 20_000
export const QUIZ_CHALLENGE_QUESTION_COUNT = 2
// 미제출 퀴즈 도전은 30분 뒤 만료(만료 시 보상·패널티 없음).
export const QUIZ_CHALLENGE_EXPIRE_MINUTES = 30
// 반복 도전으로 용돈을 무한히 모으는 것을 막는 하루(한국 시간) 상한.
export const QUIZ_CHALLENGE_DAILY_LIMIT = 4

// 클라이언트가 이유(reason)만 보내면 서버가 금액을 정한다. dailyCap은 이벤트
// 위조(eventId를 계속 바꿔 보내기)로 보상을 무한히 받는 것을 막는 하루 상한.
export type FixedWalletReason = 'meal' | 'errand' | 'part_time_job' | 'job_event' | 'quiz_reward' | 'quiz_snack'
export const FIXED_WALLET_TX: Record<FixedWalletReason, { deltaWon: number; dailyCap: number }> = {
  meal: { deltaWon: -10_000, dailyCap: 30 },
  errand: { deltaWon: 10_000, dailyCap: 10 },
  part_time_job: { deltaWon: 20_000, dailyCap: 10 },
  job_event: { deltaWon: 30_000, dailyCap: 10 },
  quiz_reward: { deltaWon: 30_000, dailyCap: 20 },
  quiz_snack: { deltaWon: -20_000, dailyCap: 20 },
}
// 마켓 구매는 상품 가격표가 클라이언트에만 있어 금액을 받되 상한·단위를 검사한다.
export const MARKET_MAX_PRICE_WON = 100_000

export interface WalletTxResult {
  status: 'applied' | 'duplicate' | 'insufficient' | 'capped'
  balanceWon: number
}

export async function getOrCreateWallet(characterId: number, userId: number): Promise<number> {
  await ensureWalletTables()
  // 최초 1회만 100,000원 지급 — 이미 있으면 DO NOTHING(기존 잔액 유지).
  await sql`
    WITH w AS (
      INSERT INTO character_wallets (character_id, user_id, balance_won)
      VALUES (${characterId}, ${userId}, ${WALLET_INITIAL_WON})
      ON CONFLICT (character_id) DO NOTHING
      RETURNING balance_won
    )
    INSERT INTO character_wallet_ledger (character_id, reason, delta_won, balance_after, idempotency_key)
    SELECT ${characterId}, 'initial', ${WALLET_INITIAL_WON}, balance_won, 'initial' FROM w
    ON CONFLICT (character_id, idempotency_key) DO NOTHING
  `
  const result = await sql<{ balance_won: number }>`
    SELECT balance_won FROM character_wallets WHERE character_id = ${characterId}
  `
  return result.rows[0]?.balance_won ?? WALLET_INITIAL_WON
}

export async function getBalance(characterId: number): Promise<number> {
  const result = await sql<{ balance_won: number }>`
    SELECT balance_won FROM character_wallets WHERE character_id = ${characterId}
  `
  return result.rows[0]?.balance_won ?? 0
}

// 한 문장(원자적)으로: ① 같은 거래 ID(idempotency_key)가 처음일 때만 내역을 남기고
// ② 그때에만 잔액을 바꾼다. 같은 요청이 동시에/반복해서 와도 한 번만 반영되고,
// 잔액 CHECK(>= 0) 제약이 있어 마이너스가 되면 문장 전체가 취소된다.
export async function applyWalletTx(params: {
  characterId: number
  reason: string
  deltaWon: number
  idempotencyKey: string
  eventId?: string | null
  dailyCap?: number
}): Promise<WalletTxResult> {
  const { characterId, reason, deltaWon, idempotencyKey, eventId = null, dailyCap } = params
  await ensureWalletTables()

  // 같은 거래 ID가 이미 처리됐으면 그 결과(현재 잔액)를 그대로 돌려준다.
  const existing = await sql<{ id: number }>`
    SELECT id FROM character_wallet_ledger WHERE character_id = ${characterId} AND idempotency_key = ${idempotencyKey}
  `
  if (existing.rows[0]) return { status: 'duplicate', balanceWon: await getBalance(characterId) }

  if (dailyCap !== undefined) {
    const used = await sql<{ n: number }>`
      SELECT COUNT(*)::int AS n FROM character_wallet_ledger
      WHERE character_id = ${characterId} AND reason = ${reason}
        AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
    `
    if ((used.rows[0]?.n ?? 0) >= dailyCap) return { status: 'capped', balanceWon: await getBalance(characterId) }
  }

  try {
    const result = await sql<{ balance_won: number }>`
      WITH claim AS (
        INSERT INTO character_wallet_ledger (character_id, reason, delta_won, balance_after, event_id, idempotency_key)
        SELECT ${characterId}, ${reason}, ${deltaWon}, w.balance_won + ${deltaWon}, ${eventId}, ${idempotencyKey}
        FROM character_wallets w WHERE w.character_id = ${characterId}
        ON CONFLICT (character_id, idempotency_key) DO NOTHING
        RETURNING 1
      )
      UPDATE character_wallets
      SET balance_won = balance_won + ${deltaWon}, updated_at = now()
      WHERE character_id = ${characterId} AND EXISTS (SELECT 1 FROM claim)
      RETURNING balance_won
    `
    const row = result.rows[0]
    if (!row) return { status: 'duplicate', balanceWon: await getBalance(characterId) }
    return { status: 'applied', balanceWon: row.balance_won }
  } catch (err) {
    // 23514 = check_violation: 잔액이 0 아래로 내려가려는 요청 — 문장 전체가 취소돼
    // 내역도 남지 않는다.
    if ((err as { code?: string }).code === '23514') {
      return { status: 'insufficient', balanceWon: await getBalance(characterId) }
    }
    throw err
  }
}

export async function recentLedger(characterId: number, limit = 20) {
  const result = await sql<{ reason: string; delta_won: number; balance_after: number; created_at: string }>`
    SELECT reason, delta_won, balance_after, created_at FROM character_wallet_ledger
    WHERE character_id = ${characterId} AND reason <> 'initial'
    ORDER BY id DESC LIMIT ${limit}
  `
  return result.rows.map((r) => ({ reason: r.reason, deltaWon: r.delta_won, balanceAfterWon: r.balance_after, createdAt: r.created_at }))
}
