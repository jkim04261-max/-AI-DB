import { sql } from './db'
import { dailyStudyLimitForTier, type AgeTier } from './characterAge'

// PR #45 checkpoint 3: "스스로 공부하기" (캐릭터가 스스로 지식을 생성·
// 검증) 전용 하루 호출 한도 — DAILY_TEACH_LIMIT(사용자가 직접 가르치는
// 검증, knowledgeLimit.ts)과도, DAILY_QUESTION_LIMIT(채팅 질문,
// dailyLimit.ts)과도 완전히 분리된 테이블/카운터/코드 경로. 사용자가
// 승인한 초기값은 하루 3회(지금은 toddler의 값 — 지시서(연령대별 AI
// 추천 생성 개수 점진적 증가)에 따라 연령대가 올라갈수록 늘어난다,
// characterAge.ts의 dailyStudyLimitForTier 참고). 테이블은 여전히
// (user_id, usage_date)당 한도 하나를 세는 계정 전체 카운터이고(캐릭터
// 별 테이블로 바꾸지 않음), "오늘 몇 번까지 쓸 수 있는지"의 기준값만
// 호출부가 넘겨준 그 순간의 캐릭터 연령대를 따른다.

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
// UPDATE 패턴. ageTier/ageNumber는 호출부(handleGenerateStudy)가 넘기는
// "지금 이 요청을 보낸 캐릭터"의 연령대 — 오늘 한도의 기준값만 거기서
// 가져오고, 카운터 자체는 여전히 계정 전체로 하나다.
export async function reserveStudy(userId: number, ageTier: AgeTier, ageNumber?: number): Promise<ReserveStudyResult> {
  await ensureStudyUsageTable()
  const limit = dailyStudyLimitForTier(ageTier, ageNumber)

  const result = await sql<{ used_count: number }>`
    INSERT INTO daily_study_usage (user_id, usage_date, used_count)
    VALUES (${userId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET used_count = daily_study_usage.used_count + 1
      WHERE daily_study_usage.used_count < ${limit}
    RETURNING used_count
  `

  const row = result.rows[0]
  if (!row) {
    return { ok: false, remaining: 0 }
  }
  return { ok: true, remaining: limit - row.used_count }
}

// PR #49: 행동력(에너지) HUD에 쓸 "소비하지 않는" 조회 — peekTeachUsage와
// 동일한 패턴의 순수 SELECT. 테이블/스키마 변경 없음. ageTier가 없으면
// (지금 어느 캐릭터를 보고 있는지 모르는 호출부) toddler 기준값(3)으로
// 대체한다 — 연령대별 증가 전과 정확히 같은 기본값이라, 이 매개변수를
// 모르는 기존 호출부는 동작이 전혀 바뀌지 않는다.
export async function peekStudyUsage(
  userId: number,
  ageTier: AgeTier = 'toddler',
  ageNumber?: number,
): Promise<{ remaining: number; limit: number }> {
  await ensureStudyUsageTable()
  const limit = dailyStudyLimitForTier(ageTier, ageNumber)

  const result = await sql<{ used_count: number }>`
    SELECT used_count FROM daily_study_usage
    WHERE user_id = ${userId} AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date
  `
  const used = result.rows[0]?.used_count ?? 0
  return { remaining: Math.max(0, limit - used), limit }
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
