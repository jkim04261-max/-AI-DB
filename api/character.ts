import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureCharacterTables, sql, type CharacterRow } from './_lib/db'
import { getSessionUser } from './_lib/auth'

const COMPANION_TYPES = new Set(['nuri', 'duri'])
// PR #43's first two supported professions. Extending this later (e.g. a
// third job) is a one-line change here — a plain nullable column, not a
// separate table, so no migration is needed either.
const PROFESSIONS = new Set(['accountant', 'singer'])

// GET lists the caller's characters; POST creates one; PATCH sets/changes
// a character's profession. All three live in one file (the same "merge
// instead of add a new endpoint file" pattern as api/conversations/[id].ts
// and api/auth/password-reset.ts) because the Vercel Hobby plan caps this
// project at 12 serverless functions — see docs/design/PR41-plan.md.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await getSessionUser(req)
  if (!session) {
    res.status(401).json({ error: '로그인이 필요해요.' })
    return
  }

  if (req.method === 'GET') {
    await handleGet(res, session.sub)
    return
  }

  if (req.method === 'POST') {
    await handlePost(req, res, session.sub)
    return
  }

  if (req.method === 'PATCH') {
    await handlePatch(req, res, session.sub)
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(res: VercelResponse, userId: number) {
  try {
    await ensureCharacterTables()

    const result = await sql<CharacterRow>`
      SELECT id, user_id, companion_type, stage, profession, created_at
      FROM characters
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `
    res.status(200).json({ characters: result.rows })
  } catch (err) {
    console.error('[api/character] unexpected error on GET', err)
    res.status(500).json({ error: '캐릭터 정보를 불러오는 중 오류가 발생했어요.' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType } = (req.body ?? {}) as { companionType?: unknown }
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) {
    res.status(400).json({ error: '누리 또는 두리 중 하나를 선택해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()

    // `stage` is never taken from the request — every account today is a
    // free account (there is no plan/payment system yet), and a free
    // account's character always starts as a child. The UNIQUE
    // (user_id, companion_type) constraint is both the "already has one"
    // check and the insert, in one round trip — the same pattern
    // api/conversations/[id].ts's handleDelete uses for ownership checks.
    const inserted = await sql<CharacterRow>`
      INSERT INTO characters (user_id, companion_type, stage)
      VALUES (${userId}, ${companionType}, 'child')
      ON CONFLICT (user_id, companion_type) DO NOTHING
      RETURNING id, user_id, companion_type, stage, profession, created_at
    `
    const character = inserted.rows[0]
    if (!character) {
      res.status(409).json({ error: '이미 만든 캐릭터예요.' })
      return
    }

    res.status(201).json({ character })
  } catch (err) {
    console.error('[api/character] unexpected error on POST', err)
    res.status(500).json({ error: '캐릭터를 만드는 중 오류가 발생했어요.' })
  }
}

// Sets or changes which profession a character has — never touches the
// character row itself beyond that one column, so this can never delete or
// reset a character (matches the "직업 변경 시 캐릭터 자체는 삭제하지
// 않는다" requirement). `companionType` + `userId` together are both the
// ownership check and the update target in one round trip, the same
// pattern handlePost's insert and api/conversations/[id].ts's delete use —
// a request naming another user's character simply matches no row.
async function handlePatch(req: VercelRequest, res: VercelResponse, userId: number) {
  const { companionType, profession } = (req.body ?? {}) as {
    companionType?: unknown
    profession?: unknown
  }
  if (typeof companionType !== 'string' || !COMPANION_TYPES.has(companionType)) {
    res.status(400).json({ error: '누리 또는 두리 중 하나를 선택해주세요.' })
    return
  }
  if (typeof profession !== 'string' || !PROFESSIONS.has(profession)) {
    res.status(400).json({ error: '회계사 또는 가수 중 하나를 선택해주세요.' })
    return
  }

  try {
    await ensureCharacterTables()

    const updated = await sql<CharacterRow>`
      UPDATE characters
      SET profession = ${profession}
      WHERE user_id = ${userId} AND companion_type = ${companionType}
      RETURNING id, user_id, companion_type, stage, profession, created_at
    `
    const character = updated.rows[0]
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }

    res.status(200).json({ character })
  } catch (err) {
    console.error('[api/character] unexpected error on PATCH', err)
    res.status(500).json({ error: '직업을 저장하는 중 오류가 발생했어요.' })
  }
}
