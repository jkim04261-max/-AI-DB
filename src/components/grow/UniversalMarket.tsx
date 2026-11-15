import { useState } from 'react'
import { Wallet } from 'lucide-react'
import type { MockWallet } from '../../hooks/useMockWallet'
import { processPurchase, reward } from '../../services/paymentService'
import {
  MARKET_CATEGORY_LABEL,
  UNIVERSAL_MARKET_CATALOG,
  type MarketCategoryId,
  type MarketItem,
  type MarketItemEffect,
} from '../../data/universalMarketCatalog'

const CATEGORIES = Object.keys(MARKET_CATEGORY_LABEL) as MarketCategoryId[]

// 지시서(누리AI 만능마켓): 이미 배포된 "아이템 마켓"(ItemMarket, Gold
// 경제)과 완전히 별개의 새 화면 — 옷/배경 장착이 아니라, 원화 가상
// 용돈(useMockWallet)으로 "체험판 쇼핑"을 해보는 화면이다. 실제 결제·
// DB 저장은 전혀 없다(useMockWallet과 같은 원칙) — 구매 내역도 세션
// 안에서만 보이고 새로고침하면 사라진다.
export default function UniversalMarket({
  wallet,
  // 지시서(한도 소진 시 구매 유도 UI): 가르치기 패널의 "만능마켓에서
  // 구매하기" 버튼이 이 카테고리를 넘겨 바로 education 탭이 열리게
  // 한다. 생략하면(= 기존 GameMenu "만능마켓" 버튼 경로) 첫 번째
  // 카테고리를 그대로 보여준다 — 이 컴포넌트는 openSheet가 바뀔 때마다
  // 새로 마운트되므로(GrowPage.tsx 참고) 이 초기값만으로 충분하다.
  initialCategory,
  // 충전권처럼 효과가 있는 아이템을 구매했을 때 호출부(GrowPage)에
  // 알려준다 — 순수 장식용 아이템은 effect가 없어 호출되지 않는다.
  // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 이제 실제 DB에
  // 이용권을 쌓는 서버 호출이라 실패할 수 있다(네트워크/인증 등) —
  // 실패하면 거부(reject)해서, 지급 안 된 걸 지급된 것처럼 조용히
  // 넘기지 않는다.
  onApplyEffect,
}: {
  wallet: MockWallet
  initialCategory?: MarketCategoryId
  onApplyEffect?: (effect: MarketItemEffect) => Promise<void>
}) {
  const [category, setCategory] = useState<MarketCategoryId>(initialCategory ?? CATEGORIES[0])
  const [pendingItem, setPendingItem] = useState<MarketItem | null>(null)
  const [purchased, setPurchased] = useState<MarketItem[]>([])
  const [error, setError] = useState<string | null>(null)
  // 지시서(예외 처리): 효과 적용 서버 호출이 끝날 때까지 "구매하기"
  // 버튼을 잠그고 안내 문구를 보여준다.
  const [applyingEffect, setApplyingEffect] = useState(false)

  const items = UNIVERSAL_MARKET_CATALOG.filter((i) => i.category === category)

  const confirmPurchase = async () => {
    if (!pendingItem) return
    const result = processPurchase(wallet, pendingItem.price, 'market_purchase')
    if (!result.ok) {
      setError(result.error ?? '가상 용돈이 부족하거나 아직 지급되지 않았어요.')
      setPendingItem(null)
      return
    }
    if (pendingItem.effect) {
      setApplyingEffect(true)
      try {
        await onApplyEffect?.(pendingItem.effect)
      } catch (err) {
        // 가상 용돈은 이미 차감됐는데 실제 이용권 지급이 실패했다 —
        // 쓰지도 못한 용돈만 사라지는 게 더 혼란스러우니 그대로
        // 되돌린다.
        reward(wallet, pendingItem.price, 'market_purchase')
        setApplyingEffect(false)
        setError(err instanceof Error ? err.message : '이용권을 지급하는 중 오류가 발생했어요.')
        setPendingItem(null)
        return
      }
      setApplyingEffect(false)
    }
    setPurchased((prev) => [pendingItem, ...prev])
    setPendingItem(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
          <Wallet size={16} className="text-amber-600" />
          <span data-testid="universal-market-balance">
            {wallet.balanceWon !== null ? `${wallet.balanceWon.toLocaleString('ko-KR')}원` : '지급 전'}
          </span>
        </div>
        <p className="text-[10px] text-amber-500">체험판 — 새로고침하면 초기화돼요</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-amber-100 p-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              category === c ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500/70'
            }`}
          >
            {MARKET_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setError(null)
              setPendingItem(item)
            }}
            className="flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center hover:border-amber-400"
          >
            <span className="text-2xl" aria-hidden>
              {item.icon}
            </span>
            <span className="text-xs font-bold text-amber-900">{item.name}</span>
            <span className="text-[11px] font-semibold text-amber-600">{item.price.toLocaleString('ko-KR')}원</span>
          </button>
        ))}
      </div>

      {purchased.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2">
          <p className="mb-1 text-[10px] font-bold text-amber-500">🛍️ 최근 구입한 물건</p>
          <div className="flex flex-wrap gap-1.5">
            {purchased.map((item, idx) => (
              <span key={`${item.id}-${idx}`} className="rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-800">
                {item.icon} {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {pendingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPendingItem(null)}>
          <div
            className="w-full max-w-xs rounded-2xl border-2 border-amber-300 bg-white p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-1 block text-4xl" aria-hidden>
              {pendingItem.icon}
            </span>
            <h3 className="text-base font-bold text-amber-900">{pendingItem.name}</h3>
            <p className="mt-1 text-sm font-semibold text-amber-600">{pendingItem.price.toLocaleString('ko-KR')}원</p>
            <p className="mt-3 text-xs text-amber-700/80">이 물건을 가상 용돈으로 구입할까요?</p>
            {applyingEffect && <p className="mt-2 text-[11px] font-semibold text-amber-500">구매 내역을 불러오는 중입니다...</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingItem(null)}
                disabled={applyingEffect}
                className="flex-1 rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPurchase}
                disabled={applyingEffect}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-xs font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600 disabled:opacity-70"
              >
                {applyingEffect ? '구매하는 중...' : '구입하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
