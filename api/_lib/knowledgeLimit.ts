import { sql } from './db'

// Hard ceiling on how many Gemini knowledge-verification calls a signed-in
// account gets per Asia/Seoul calendar day — completely separate from
// DAILY_QUESTION_LIMIT (api/_lib/dailyLimit.ts). Different table, different
// counter, different code path: using up today's chat questions has no
// effect on this, and vice versa. Unlike the chat limit, this one has no
// on/off flag — it's a brand-new Gemini-cost-incurring feature, so it's a
// hard limit from day one rather than something retrofitted onto an
// already-shipped unlimited path.
export const DAILY_TEACH_LIMIT = 10

let teachUsageTableReady: Promise<unknown> | null = null

// One row per (user, Asia/Seoul calendar day), exactly mirroring
// ensureDailyUsageTable in dailyLimit.ts — usage_date is computed in
// Postgres (AT TIME ZONE 'Asia/Seoul') so the KST midnight rollover is
// correct regardless of the serverless function's own runtime timezone.
export function ensureTeachUsageTable() {
  if (!teachUsageTableReady) {
    teachUsageTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS daily_teach_usage (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          used_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, usage_date)
        )
      `
    })().catch((err) => {
      teachUsageTableReady = null
      throw err
    })
  }
  return teachUsageTableReady
}

export interface ReserveTeachResult {
  ok: boolean
  // When ok=true: remaining verification calls *after* this reservation.
  // When ok=false: always 0 (already at today's cap).
  remaining: number
}

// Same atomic "check-and-increment in one statement" as reserveQuestion —
// see that function's comment in dailyLimit.ts for why this needs to be
// one statement rather than a separate read-then-write.
export async function reserveTeach(userId: number): Promise<ReserveTeachResult> {
  await ensureTeachUsageTable()

  const result = await sql<{ used_count: number }>`
    INSERT INTO daily_teach_usage (user_id, usage_date, used_count)
    VALUES (${userId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET used_count = daily_teach_usage.used_count + 1
      WHERE daily_teach_usage.used_count < ${DAILY_TEACH_LIMIT}
    RETURNING used_count
  `

  const row = result.rows[0]
  if (!row) {
    return { ok: false, remaining: 0 }
  }
  return { ok: true, remaining: DAILY_TEACH_LIMIT - row.used_count }
}

// Undoes exactly one reservation this request made — called only when the
// Gemini verification call itself failed (network/timeout/non-2xx), so a
// failed attempt that produced no usable result doesn't count against the
// daily cap. A successful call that comes back "unverifiable" (malformed
// JSON, or Gemini's own genuine verdict) is NOT refunded — Gemini did
// answer, and that's what's being metered.
export async function refundTeach(userId: number): Promise<void> {
  await ensureTeachUsageTable()

  await sql`
    UPDATE daily_teach_usage
    SET used_count = used_count - 1
    WHERE user_id = ${userId}
      AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date
      AND used_count > 0
  `
}
