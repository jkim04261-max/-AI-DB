import { sql } from './db'

// Hard ceiling on how many AI questions a signed-in account gets per
// Asia/Seoul calendar day. Shared by the enforcement path (api/conversations/
// [id].ts) and the display path (api/auth/me.ts) so there's exactly one
// number to change later.
export const DAILY_QUESTION_LIMIT = 10

// Single on/off switch for the whole feature. Checked fresh on every call
// (no module-scope caching) so a changed env var takes effect without a
// redeploy being the only way to pick it up — same reasoning as
// api/admin/stats.ts's ADMIN_EMAILS check. When this is false/unset, no
// function in this file is called from api/conversations/[id].ts or
// api/auth/me.ts, so no DB access or counter mutation happens at all —
// existing chat behavior is completely unchanged.
export function isDailyLimitEnabled(): boolean {
  return process.env.DAILY_QUESTION_LIMIT_ENABLED === 'true'
}

let dailyUsageTableReady: Promise<unknown> | null = null

// Lazily creates the usage counter table and the messages.client_request_id
// column/index this feature needs — only ever called when the feature flag
// is on, so none of this touches the DB while the flag is off. Both changes
// are purely additive (new table; new nullable column + partial index on
// the existing `messages` table), so they can't affect any existing row or
// query that doesn't reference them.
export function ensureDailyUsageTable() {
  if (!dailyUsageTableReady) {
    dailyUsageTableReady = (async () => {
      // One row per (user, Asia/Seoul calendar day). usage_date is computed
      // in Postgres from its own IANA tz database (AT TIME ZONE 'Asia/Seoul')
      // rather than in Node, so the KST midnight rollover is correct
      // regardless of the serverless function's own runtime timezone.
      await sql`
        CREATE TABLE IF NOT EXISTS daily_question_usage (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          used_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, usage_date)
        )
      `

      // Lets a client tag a chat request with its own idempotency key —
      // reserveOrReplayQuestion in api/conversations/[id].ts uses this to
      // detect "this exact request was already fully processed" and return
      // the prior result instead of charging (or re-charging) the quota.
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_request_id TEXT`
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS messages_conv_client_request_id_idx
          ON messages (conversation_id, client_request_id)
          WHERE client_request_id IS NOT NULL
      `
    })().catch((err) => {
      dailyUsageTableReady = null
      throw err
    })
  }
  return dailyUsageTableReady
}

export interface ReserveResult {
  ok: boolean
  // When ok=true: remaining questions *after* this reservation. When
  // ok=false: always 0 (the account is already at the daily cap).
  remaining: number
}

// Atomically checks-and-increments in a single statement, so concurrent
// requests from the same account can't both observe "9 used" and both
// proceed to 11 — Postgres serializes concurrent UPDATEs to the same row
// via its normal row-level locking, and the conditional
// "ON CONFLICT ... DO UPDATE ... WHERE used_count < limit" means the
// UPDATE (and therefore RETURNING) simply produces no row once the cap is
// hit, with no separate read-then-write race window. This is the one
// place in the whole feature where going over the limit could happen if
// it weren't atomic, so it deliberately has no fallback path — if this
// throws (e.g. a DB outage), the caller's own try/catch rejects the
// request instead of letting it through unmetered.
export async function reserveQuestion(userId: number): Promise<ReserveResult> {
  await ensureDailyUsageTable()

  const result = await sql<{ used_count: number }>`
    INSERT INTO daily_question_usage (user_id, usage_date, used_count)
    VALUES (${userId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET used_count = daily_question_usage.used_count + 1
      WHERE daily_question_usage.used_count < ${DAILY_QUESTION_LIMIT}
    RETURNING used_count
  `

  const row = result.rows[0]
  if (!row) {
    return { ok: false, remaining: 0 }
  }
  return { ok: true, remaining: DAILY_QUESTION_LIMIT - row.used_count }
}

// Undoes exactly one reservation this same request made — called only from
// the catch branch around a Gemini call that followed a successful
// reserveQuestion, so "a question that wasn't actually answered doesn't
// count against the limit." The `used_count > 0` guard is defensive only;
// in normal operation this is always undoing a reservation this very
// request just made a moment earlier.
export async function refundQuestion(userId: number): Promise<void> {
  await ensureDailyUsageTable()

  await sql`
    UPDATE daily_question_usage
    SET used_count = used_count - 1
    WHERE user_id = ${userId}
      AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date
      AND used_count > 0
  `
}

// Best-effort read for display only (api/auth/me.ts) — never used to decide
// whether to allow a request (reserveQuestion is the only enforcement
// point). Returns null on any failure so a transient DB hiccup just hides
// the "오늘 남은 무료 질문" banner instead of breaking /api/auth/me, which
// every page load depends on for session state.
export async function getRemainingQuestions(userId: number): Promise<number | null> {
  try {
    await ensureDailyUsageTable()
    const result = await sql<{ used_count: number }>`
      SELECT used_count FROM daily_question_usage
      WHERE user_id = ${userId} AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date
    `
    const used = result.rows[0]?.used_count ?? 0
    return Math.max(0, DAILY_QUESTION_LIMIT - used)
  } catch (err) {
    console.error('[dailyLimit] failed to read remaining questions', err)
    return null
  }
}
