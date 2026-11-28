import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, ensureCharacterTables, ensureWalletTables, type CharacterRow } from './db'
import { effectiveAgeTier } from './characterMissions'
import { getQuestionById, getQuestionsForProfession, type ExamQuestion } from './examQuestions'
import { OBJECTIVE_QUIZ_QUESTIONS, getObjectiveQuizQuestionById } from './objectiveQuizQuestions'
import {
  FIXED_WALLET_TX,
  MARKET_MAX_PRICE_WON,
  QUIZ_CHALLENGE_DAILY_LIMIT,
  QUIZ_CHALLENGE_EXPIRE_MINUTES,
  QUIZ_CHALLENGE_QUESTION_COUNT,
  QUIZ_CHALLENGE_STAKE_WON,
  applyWalletTx,
  getBalance,
  getOrCreateWallet,
  recentLedger,
  walletEnabled,
  type FixedWalletReason,
} from './wallet'

// 서버 지갑 API(api/character.ts의 ?action=wallet* 로 연결 — Vercel 무료 플랜
// 함수 개수 한도 때문에 새 파일 대신 기존 character 함수의 action으로 둔다).

async function findCharacter(userId: number, companionType: unknown): Promise<CharacterRow | null> {
  if (companionType !== 'nuri' && companionType !== 'duri') return null
  await ensureCharacterTables()
  const result = await sql<CharacterRow>`
    SELECT id, user_id, companion_type, stage, profession, custom_profession_label, level, exp, mission_unlocked_tier, focus_percent, final_exam_attempts, final_exam_passed, reset_at, address, building_built_at, building_type, building_name, building_plot_id, created_at
    FROM characters WHERE user_id = ${userId} AND companion_type = ${companionType}
  `
  return result.rows[0] ?? null
}

// 꺼져 있으면 DB를 전혀 건드리지 않고 클라이언트가 기존(체험판) 지갑을 쓰게 한다.
function disabled(res: VercelResponse): boolean {
  if (walletEnabled()) return false
  res.status(200).json({ enabled: false })
  return true
}

const EVENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export async function handleWalletGet(req: VercelRequest, res: VercelResponse, userId: number) {
  if (disabled(res)) return
  try {
    const character = await findCharacter(userId, req.query.companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    const balanceWon = await getOrCreateWallet(character.id, userId)
    res.status(200).json({ enabled: true, balanceWon, history: await recentLedger(character.id) })
  } catch (err) {
    console.error('[api/character] wallet get failed', err)
    res.status(500).json({ error: '가상 용돈을 불러오는 중 오류가 발생했어요.' })
  }
}

export async function handleWalletTx(req: VercelRequest, res: VercelResponse, userId: number) {
  if (disabled(res)) return
  const { companionType, reason, eventId, amountWon } = (req.body ?? {}) as Record<string, unknown>
  if (typeof eventId !== 'string' || !EVENT_ID_RE.test(eventId)) {
    res.status(400).json({ error: '올바르지 않은 요청이에요.' })
    return
  }
  try {
    const character = await findCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    await getOrCreateWallet(character.id, userId)

    let result
    if (typeof reason === 'string' && reason in FIXED_WALLET_TX) {
      const fixed = FIXED_WALLET_TX[reason as FixedWalletReason]
      result = await applyWalletTx({
        characterId: character.id,
        reason,
        deltaWon: fixed.deltaWon,
        idempotencyKey: `${reason}:${eventId}`,
        eventId,
        dailyCap: fixed.dailyCap,
      })
    } else if (reason === 'market_purchase') {
      if (typeof amountWon !== 'number' || !Number.isInteger(amountWon) || amountWon < 1000 || amountWon > MARKET_MAX_PRICE_WON || amountWon % 1000 !== 0) {
        res.status(400).json({ error: '올바르지 않은 금액이에요.' })
        return
      }
      result = await applyWalletTx({
        characterId: character.id,
        reason,
        deltaWon: -amountWon,
        idempotencyKey: `market_purchase:${eventId}`,
        eventId,
      })
    } else if (reason === 'market_refund') {
      // 환불 금액은 원래 구매 내역에서 서버가 읽는다(클라이언트가 금액을 정하지 않음).
      const original = await sql<{ delta_won: number }>`
        SELECT delta_won FROM character_wallet_ledger
        WHERE character_id = ${character.id} AND idempotency_key = ${`market_purchase:${eventId}`}
      `
      const spent = original.rows[0]?.delta_won
      if (spent === undefined || spent >= 0) {
        res.status(404).json({ error: '환불할 구매 내역이 없어요.' })
        return
      }
      result = await applyWalletTx({
        characterId: character.id,
        reason,
        deltaWon: -spent,
        idempotencyKey: `market_refund:${eventId}`,
        eventId,
      })
    } else {
      res.status(400).json({ error: '올바르지 않은 요청이에요.' })
      return
    }

    res.status(200).json({ enabled: true, ...result })
  } catch (err) {
    console.error('[api/character] wallet tx failed', err)
    res.status(500).json({ error: '가상 용돈을 처리하는 중 오류가 발생했어요.' })
  }
}

interface ChallengeRow {
  id: string
  character_id: number
  context: 'meal' | 'errand'
  profession: string
  age_tier: string
  question_ids: string[]
  status: 'open' | 'settled' | 'expired'
  correct_count: number | null
  delta_won: number | null
  created_at: string
}

interface BankQuestion {
  id: string
  text: string
  choices: string[]
  correctIndex: number
  explanation: string
}

function lookupQuestion(id: string): BankQuestion | null {
  const exam: ExamQuestion | undefined = getQuestionById(id)
  if (exam) return exam
  return getObjectiveQuizQuestionById(id)
}

// 직업에 맞는 문제은행이 있으면(현재 회계사·가수) 그것을, 없으면 연령과 무관한 기본
// 생활 문제를 쓴다. 직업·연령별 전체 문제은행은 별도 PR에서 이 함수만 바꿔 연결한다.
function poolFor(profession: string | null): BankQuestion[] {
  if (profession === 'accountant' || profession === 'singer') return getQuestionsForProfession(profession)
  return OBJECTIVE_QUIZ_QUESTIONS
}

const publicQuestion = (q: BankQuestion) => ({ id: q.id, text: q.text, choices: q.choices })

export async function handleQuizChallengeStart(req: VercelRequest, res: VercelResponse, userId: number) {
  if (disabled(res)) return
  const { companionType, context } = (req.body ?? {}) as Record<string, unknown>
  if (context !== 'meal' && context !== 'errand') {
    res.status(400).json({ error: '올바르지 않은 요청이에요.' })
    return
  }
  try {
    const character = await findCharacter(userId, companionType)
    if (!character) {
      res.status(404).json({ error: '캐릭터를 찾을 수 없어요.' })
      return
    }
    await ensureWalletTables()
    const balance = await getOrCreateWallet(character.id, userId)

    // 30분 지난 미제출 도전은 만료 — 잔액 변동 없음.
    await sql`
      UPDATE job_quiz_challenges SET status = 'expired'
      WHERE character_id = ${character.id} AND status = 'open'
        AND created_at < now() - make_interval(mins => ${QUIZ_CHALLENGE_EXPIRE_MINUTES})
    `
    // 진행 중인 도전이 있으면 새로 만들지 않고 같은 문제를 이어서 풀게 한다.
    const open = await sql<ChallengeRow>`
      SELECT id, character_id, context, profession, age_tier, question_ids, status, correct_count, delta_won, created_at
      FROM job_quiz_challenges WHERE character_id = ${character.id} AND status = 'open' ORDER BY created_at DESC LIMIT 1
    `
    if (open.rows[0]) {
      const questions = open.rows[0].question_ids.map(lookupQuestion).filter((q): q is BankQuestion => q !== null)
      res.status(200).json({ enabled: true, challengeId: open.rows[0].id, questions: questions.map(publicQuestion), balanceWon: balance })
      return
    }

    if (balance < QUIZ_CHALLENGE_STAKE_WON) {
      res.status(409).json({ error: `가상 용돈이 ${QUIZ_CHALLENGE_STAKE_WON.toLocaleString('ko-KR')}원 이상일 때 도전할 수 있어요.`, balanceWon: balance })
      return
    }

    const today = await sql<{ question_ids: string[] }>`
      SELECT question_ids FROM job_quiz_challenges
      WHERE character_id = ${character.id} AND status = 'settled'
        AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
    `
    if (today.rows.length >= QUIZ_CHALLENGE_DAILY_LIMIT) {
      res.status(429).json({ error: '오늘 도전할 수 있는 횟수를 모두 사용했어요. 내일 다시 도전해 보세요.', balanceWon: balance })
      return
    }
    const usedToday = new Set(today.rows.flatMap((r) => r.question_ids))
    const candidates = poolFor(character.profession).filter((q) => !usedToday.has(q.id))
    if (candidates.length < QUIZ_CHALLENGE_QUESTION_COUNT) {
      res.status(429).json({ error: '오늘 풀 수 있는 새 문제를 모두 풀었어요. 내일 다시 도전해 보세요.', balanceWon: balance })
      return
    }
    const picked = [...candidates].sort(() => Math.random() - 0.5).slice(0, QUIZ_CHALLENGE_QUESTION_COUNT)
    const challengeId = randomUUID()
    await sql`
      INSERT INTO job_quiz_challenges (id, character_id, context, profession, age_tier, question_ids)
      VALUES (${challengeId}, ${character.id}, ${context}, ${character.profession ?? 'none'}, ${effectiveAgeTier(character)},
              ${`{${picked.map((q) => `"${q.id}"`).join(',')}}`}::text[])
    `
    res.status(200).json({ enabled: true, challengeId, questions: picked.map(publicQuestion), balanceWon: balance })
  } catch (err) {
    console.error('[api/character] quiz challenge start failed', err)
    res.status(500).json({ error: '퀴즈를 준비하는 중 오류가 발생했어요.' })
  }
}

export async function handleQuizChallengeSubmit(req: VercelRequest, res: VercelResponse, userId: number) {
  if (disabled(res)) return
  const { challengeId, answers } = (req.body ?? {}) as Record<string, unknown>
  if (
    typeof challengeId !== 'string' ||
    !Array.isArray(answers) ||
    answers.length !== QUIZ_CHALLENGE_QUESTION_COUNT ||
    !answers.every((a) => Number.isInteger(a) && (a as number) >= 0 && (a as number) < 10)
  ) {
    res.status(400).json({ error: '올바르지 않은 요청이에요.' })
    return
  }
  try {
    await ensureWalletTables()
    // 본인 캐릭터의 도전만 조회한다.
    const found = await sql<ChallengeRow>`
      SELECT c.id, c.character_id, c.context, c.profession, c.age_tier, c.question_ids, c.status, c.correct_count, c.delta_won, c.created_at
      FROM job_quiz_challenges c JOIN characters ch ON ch.id = c.character_id
      WHERE c.id = ${challengeId} AND ch.user_id = ${userId}
    `
    let challenge = found.rows[0]
    if (!challenge) {
      res.status(404).json({ error: '퀴즈 도전을 찾을 수 없어요.' })
      return
    }
    const questions = challenge.question_ids.map(lookupQuestion)
    if (questions.some((q) => q === null)) {
      res.status(500).json({ error: '문제를 찾을 수 없어요.' })
      return
    }
    const bank = questions as BankQuestion[]

    if (challenge.status === 'expired' || (challenge.status === 'open' && Date.now() - new Date(challenge.created_at).getTime() > QUIZ_CHALLENGE_EXPIRE_MINUTES * 60_000)) {
      await sql`UPDATE job_quiz_challenges SET status = 'expired' WHERE id = ${challengeId} AND status = 'open'`
      res.status(410).json({ error: '도전 시간이 지났어요. 보상도 차감도 없어요.' })
      return
    }

    if (challenge.status === 'open') {
      const correctCount = bank.filter((q, i) => answers[i] === q.correctIndex).length
      const success = correctCount === bank.length
      const balance = await getBalance(challenge.character_id)
      const deltaWon = success ? QUIZ_CHALLENGE_STAKE_WON : -Math.min(QUIZ_CHALLENGE_STAKE_WON, balance)
      // 선점: 'open'인 행을 'settled'로 바꾸는 데 성공한 요청만 정산한다.
      const claimed = await sql<{ id: string }>`
        UPDATE job_quiz_challenges
        SET status = 'settled', correct_count = ${correctCount}, delta_won = ${deltaWon}, settled_at = now()
        WHERE id = ${challengeId} AND status = 'open'
        RETURNING id
      `
      if (!claimed.rows[0]) {
        const again = await sql<ChallengeRow>`
          SELECT id, character_id, context, profession, age_tier, question_ids, status, correct_count, delta_won, created_at
          FROM job_quiz_challenges WHERE id = ${challengeId}
        `
        challenge = again.rows[0] ?? challenge
      } else {
        challenge = { ...challenge, status: 'settled', correct_count: correctCount, delta_won: deltaWon }
      }
    }

    // 이미 정산된 도전도 같은 거래 ID로 다시 반영을 시도한다(이미 반영됐다면 중복으로
    // 무시되고, 정산 직후 서버가 끊겨 반영이 빠졌다면 여기서 복구된다).
    const deltaWon = challenge.delta_won ?? 0
    let balanceWon = await getBalance(challenge.character_id)
    if (deltaWon !== 0) {
      const tx = await applyWalletTx({
        characterId: challenge.character_id,
        reason: deltaWon > 0 ? 'job_quiz_reward' : 'job_quiz_penalty',
        deltaWon,
        idempotencyKey: `challenge:${challenge.id}`,
        eventId: challenge.id,
      })
      balanceWon = tx.balanceWon
    }

    res.status(200).json({
      enabled: true,
      outcome: challenge.correct_count === bank.length ? 'success' : 'fail',
      correctCount: challenge.correct_count ?? 0,
      deltaWon,
      balanceWon,
      review: bank.map((q, i) => ({
        id: q.id,
        text: q.text,
        choices: q.choices,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        // 정산 뒤 다시 조회하는 경우를 위해 내가 낸 답은 첫 제출 값만 신뢰한다.
        myAnswer: answers[i],
      })),
      history: await recentLedger(challenge.character_id),
    })
  } catch (err) {
    console.error('[api/character] quiz challenge submit failed', err)
    res.status(500).json({ error: '결과를 처리하는 중 오류가 발생했어요.' })
  }
}
