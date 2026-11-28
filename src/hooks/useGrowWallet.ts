import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionType } from '../context/GrowthContext'
import { useMockWallet, type MockWallet } from './useMockWallet'
import type { PaymentReason } from '../services/paymentService'
import { fetchWallet, newEventId, postWalletTx, type WalletHistoryItem } from '../services/walletApi'

// /grow 전용 지갑. 서버 지갑(WALLET_API_ENABLED)이 켜져 있으면 캐릭터별 서버
// 잔액을 기준으로 삼고(새로고침·재로그인·기기 변경에도 유지), 꺼져 있으면 기존
// 체험판(useMockWallet)과 똑같이 동작한다. 화면은 즉시 반영(낙관적)하고, 서버
// 응답이 오면 서버 잔액으로 덮어쓴다 — 중복 지급·잔액 부족 판단은 서버가 한다.
const SERVER_REASONS: PaymentReason[] = ['meal', 'errand', 'part_time_job', 'job_event', 'quiz_reward', 'quiz_snack']

export function useGrowWallet(companionType: CompanionType | null) {
  const mock = useMockWallet()
  const { setBalance } = mock
  const [serverMode, setServerMode] = useState(false)
  const [history, setHistory] = useState<WalletHistoryItem[]>([])
  const seqRef = useRef(0)
  const appliedSeqRef = useRef(0)
  const lastPurchaseIdRef = useRef<string | null>(null)
  const typeRef = useRef(companionType)
  useEffect(() => {
    typeRef.current = companionType
  }, [companionType])

  const refresh = useCallback(
    async (type: CompanionType | null = typeRef.current) => {
      if (!type) return
      const seq = ++seqRef.current
      try {
        const snap = await fetchWallet(type)
        if (!snap || seq < appliedSeqRef.current) return
        appliedSeqRef.current = seq
        if (snap.enabled) {
          setServerMode(true)
          setBalance(snap.balanceWon)
          setHistory(snap.history)
        } else {
          setServerMode(false)
        }
      } catch {
        // 네트워크 오류 — 현재 화면 값을 그대로 둔다.
      }
    },
    [setBalance],
  )

  useEffect(() => {
    void refresh(companionType)
  }, [companionType, refresh])

  const onTransaction = useCallback(
    (reason: PaymentReason, deltaWon: number) => {
      const type = typeRef.current
      if (!serverMode || !type) return
      let serverReason: string
      let eventId = newEventId()
      let amountWon: number | undefined
      if ((SERVER_REASONS as string[]).includes(reason)) {
        serverReason = reason
      } else if (reason === 'market_purchase' && deltaWon < 0) {
        serverReason = 'market_purchase'
        amountWon = -deltaWon
        lastPurchaseIdRef.current = eventId
      } else if (reason === 'market_purchase' && deltaWon > 0 && lastPurchaseIdRef.current) {
        serverReason = 'market_refund'
        eventId = lastPurchaseIdRef.current
      } else {
        return
      }
      const seq = ++seqRef.current
      void postWalletTx({ companionType: type, reason: serverReason, eventId, amountWon })
        .then((res) => {
          if (res && typeof res.balanceWon === 'number') {
            if (seq >= appliedSeqRef.current) {
              appliedSeqRef.current = seq
              setBalance(res.balanceWon)
            }
          } else {
            void refresh(type)
          }
        })
        .catch(() => void refresh(type))
    },
    [serverMode, setBalance, refresh],
  )

  const wallet = useMemo<MockWallet>(() => ({ ...mock, onTransaction }), [mock, onTransaction])
  return { wallet, serverMode, serverHistory: history, refresh }
}
