import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionUser } from '../_lib/auth'
import { DAILY_QUESTION_LIMIT, getRemainingQuestions, isDailyLimitEnabled } from '../_lib/dailyLimit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await getSessionUser(req)

  if (!session) {
    res.status(200).json({ user: null })
    return
  }

  // Both fields are omitted entirely when the feature flag is off, so a
  // client that doesn't know about them sees exactly the old response
  // shape — and no DB call for usage happens in that case either.
  if (!isDailyLimitEnabled()) {
    res.status(200).json({ user: { id: session.sub, email: session.email } })
    return
  }

  const remainingQuestions = await getRemainingQuestions(session.sub)
  res.status(200).json({
    user: { id: session.sub, email: session.email },
    dailyQuestionLimit: DAILY_QUESTION_LIMIT,
    remainingQuestions,
  })
}
