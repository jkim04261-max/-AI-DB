import { sql } from './db'

// PR #45 checkpoint 3: "스스로 공부하기" (캐릭터가 스스로 지식을 생성·
// 검증) 전용 하루 호출 한도 — DAILY_TEACH_LIMIT(사용자가 직접 가르치는
// 검증, knowledgeLimit.ts)과도, DAILY_QUESTION_LIMIT(채팅 질문,
// dailyLimit.ts)과도 완전히 분리된 테이블/카운터/코드 경로. 사용자가
// 승인한 초기값은 하루 3회.
export const DAILY_STUDY_LIMIT = 3

let studyUsageTableReady: Promise<unknown> | null = null

// daily_teach_usage/daily_question_usage와 동일한 패턴: (user, Asia/Seoul
// 달력일)당 1행, usage_date는 Postgres에서 계산해 자정 경계가 서버리스
// 함수의 런타임 타임존과 무관하게 정확하도록 한다.
export function ensureStudyUsageTable() {
  if (!studyUsageTableReady) {
    studyUsageTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS daily_study_usage (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          used_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, usage_date)
        )
      `
    })().catch((err) => {
      studyUsageTableReady = null
      throw err
    })
  }
  return studyUsageTableReady
}

export interface ReserveStudyResult {
  ok: boolean
  remaining: number
}

// reserveTeach/reserveQuestion과 동일한 원자적 "검사 후 증가" 1문장
// UPDATE 패턴.
export async function reserveStudy(userId: number): Promise<ReserveStudyResult> {
  await ensureStudyUsageTable()

  const result = await sql<{ used_count: number }>`
    INSERT INTO daily_study_usage (user_id, usage_date, used_count)
    VALUES (${userId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET used_count = daily_study_usage.used_count + 1
      WHERE daily_study_usage.used_count < ${DAILY_STUDY_LIMIT}
    RETURNING used_count
  `

  const row = result.rows[0]
  if (!row) {
    return { ok: false, remaining: 0 }
  }
  return { ok: true, remaining: DAILY_STUDY_LIMIT - row.used_count }
}

// Gemini 호출 자체가 실패했을 때(설정 오류/타임아웃/네트워크/비2xx 또는
// 응답을 해석할 수 없는 SelfStudyParseError)만 호출 — 실제로 쓸 수 있는
// 결과가 없었던 시도는 하루 한도에서 제외한다. generateSelfStudy가
// appropriate/needs_revision/unverifiable 중 무엇을 반환했든 "정상 응답"
// 이므로 환불하지 않는다(reserveTeach/refundTeach와 동일한 회계 방식).
export async function refundStudy(userId: number): Promise<void> {
  await ensureStudyUsageTable()

  await sql`
    UPDATE daily_study_usage
    SET used_count = used_count - 1
    WHERE user_id = ${userId}
      AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date
      AND used_count > 0
  `
}
