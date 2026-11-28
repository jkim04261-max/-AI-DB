// Tests src/services/jobQuizChallenge.ts — 직업 퀴즈 도전 정산 규칙
// (2문제 전부 정답 +20,000 / 하나라도 오답 -20,000 / 잔액 보호).
const { bundle } = require('./bundle.cjs')
const { Tracker } = require('./helpers.cjs')

async function run() {
  const svc = bundle('src/services/jobQuizChallenge.ts')
  const t = new Tracker('job-quiz-challenge')

  const makeWallet = (start) => {
    const w = {
      balanceWon: start,
      spend(n) {
        if (w.balanceWon === null || w.balanceWon < n) return false
        w.balanceWon -= n
        return true
      },
      earn(n) {
        if (w.balanceWon !== null) w.balanceWon += n
      },
    }
    return w
  }
  const settleOn = (start, correct) => {
    const w = makeWallet(start)
    const s = svc.computeJobQuizSettlement(correct, 2, start)
    svc.applyJobQuizSettlement(w, s)
    return { w, s }
  }

  {
    const { w, s } = settleOn(100000, 2)
    t.assert(s.outcome === 'success' && s.deltaWon === 20000 && w.balanceWon === 120000, '2 correct → +20,000')
  }
  {
    const { w, s } = settleOn(100000, 1)
    t.assert(s.outcome === 'fail' && s.deltaWon === -20000 && w.balanceWon === 80000, '1 correct/1 wrong → -20,000 (no partial reward)')
  }
  {
    const { w } = settleOn(100000, 0)
    t.assert(w.balanceWon === 80000, '2 wrong → -20,000')
  }
  {
    const { w } = settleOn(20000, 0)
    t.assert(w.balanceWon === 0, 'exactly 20,000 balance: penalty leaves 0, never negative')
  }
  {
    const { w, s } = settleOn(5000, 0)
    t.assert(w.balanceWon >= 0 && s.deltaWon === -5000, 'low balance is clamped, never negative')
  }
  {
    const { w, s } = settleOn(null, 2)
    t.assert(w.balanceWon === null && s.deltaWon === 0, 'no wallet → no money change')
  }

  t.assert(svc.canAttemptJobQuizChallenge(20000) === true, 'challenge allowed at 20,000')
  t.assert(svc.canAttemptJobQuizChallenge(19999) === false, 'challenge disabled below 20,000')
  t.assert(svc.canAttemptJobQuizChallenge(null) === false, 'challenge disabled without wallet')

  const qs = svc.pickJobQuizQuestions()
  t.assert(qs.length === 2 && qs[0].id !== qs[1].id, 'picks 2 distinct questions from the existing bank')
  t.assert(
    qs.every((q) => q.choices.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.choices.length),
    'picked questions are well-formed',
  )

  return t.summary()
}

module.exports = { run }
