import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionUser } from './auth'
import { sql } from './db'

interface WorkProfile {
  workplace: string
  industry: string
  careerStartDate: string
  workplaceVisibility: 'private' | 'public'
}

let columnsReady: Promise<unknown> | undefined

function ensureWorkProfileColumns() {
  columnsReady ??= sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS workplace VARCHAR(100) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS industry VARCHAR(80) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS career_start_date DATE,
      ADD COLUMN IF NOT EXISTS workplace_visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (workplace_visibility IN ('private', 'public'))
  `.catch((error) => {
    columnsReady = undefined
    throw error
  })
  return columnsReady
}

function parseWorkProfile(body: unknown): WorkProfile | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { workplace, industry, careerStartDate, workplaceVisibility } = body as Partial<WorkProfile>
  if (typeof workplace !== 'string' || typeof industry !== 'string' || typeof careerStartDate !== 'string') return null
  if (workplace.trim().length > 100 || industry.trim().length > 80) return null
  if (workplace.includes('\0') || industry.includes('\0')) return null
  if (workplaceVisibility !== 'private' && workplaceVisibility !== 'public') return null

  if (careerStartDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(careerStartDate) || careerStartDate.startsWith('0000-')) return null
    const date = new Date(careerStartDate)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== careerStartDate) return null
  }

  return { workplace: workplace.trim(), industry: industry.trim(), careerStartDate, workplaceVisibility }
}

export async function handleWorkProfile(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).json({ error: '지원하지 않는 요청이에요.' })
  }

  try {
    const session = await getSessionUser(req)
    if (!session) return res.status(401).json({ error: '로그인이 필요해요.' })

    const profile = req.method === 'PUT' ? parseWorkProfile(req.body) : null
    if (req.method === 'PUT' && !profile) {
      return res.status(400).json({ error: '직장·상호명, 업종, 경력 시작일과 공개 범위를 확인해 주세요.' })
    }

    await ensureWorkProfileColumns()

    const result = profile
      ? await sql<WorkProfile>`
        UPDATE users
        SET workplace = ${profile.workplace}, industry = ${profile.industry},
            career_start_date = ${profile.careerStartDate || null},
            workplace_visibility = ${profile.workplaceVisibility}
        WHERE id = ${session.sub}
        RETURNING workplace, industry, COALESCE(to_char(career_start_date, 'YYYY-MM-DD'), '') AS "careerStartDate",
                  workplace_visibility AS "workplaceVisibility"
      `
      : await sql<WorkProfile>`
        SELECT workplace, industry, COALESCE(to_char(career_start_date, 'YYYY-MM-DD'), '') AS "careerStartDate",
               workplace_visibility AS "workplaceVisibility"
        FROM users WHERE id = ${session.sub}
      `

    const savedProfile = result.rows[0]
    if (!savedProfile) return res.status(401).json({ error: '로그인이 필요해요.' })
    return res.status(200).json({ profile: savedProfile })
  } catch {
    console.error('[api/account/work-profile] profile request failed')
    return res.status(500).json({ error: '직업 프로필을 처리하지 못했어요. 다시 시도해 주세요.' })
  }
}
