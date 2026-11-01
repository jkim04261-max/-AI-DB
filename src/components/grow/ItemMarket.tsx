import { useState } from 'react'
import { Coins, Check, Lock } from 'lucide-react'
import type { CompanionType } from '../../context/GrowthContext'
import { CUSTOMIZATION_CATALOG, type OutfitId } from '../../data/characterCustomization'
import { BACKGROUND_CATALOG, type BackgroundId } from '../../data/backgroundCatalog'
import type { MockInventory } from '../../hooks/useMockInventory'

type MarketTab = 'outfit' | 'background'

// PR #50: 아이템 마켓(상점)의 뼈대 — 모의 골드로 옷/배경을 구매해 잠금
// 해제한다. 실제 결제·DB 저장은 없다(useMockInventory 참고) — 그 사실을
// 화면에도 분명히 적어서, 진짜 구매가 되는 것처럼 보이지 않게 한다.
export default function ItemMarket({ companionType, inventory }: { companionType: CompanionType; inventory: MockInventory }) {
  const [tab, setTab] = useState<MarketTab>('outfit')

  const outfitItems = CUSTOMIZATION_CATALOG.filter(
    (i) => i.category === 'outfit' && (i.companionType === companionType || i.companionType === 'any'),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
          <Coins size={16} className="text-amber-600" />
          <span data-testid="market-gold">{inventory.gold}</span> Gold
        </div>
        <p className="text-[10px] text-amber-500">체험판 — 새로고침하면 초기화돼요</p>
      </div>

      <div className="flex gap-1 rounded-full bg-amber-100 p-1">
        {(['outfit', 'background'] as MarketTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500/70'
            }`}
          >
            {t === 'outfit' ? '옷' : '배경'}
          </button>
        ))}
      </div>

      {tab === 'outfit' && (
        <div className="grid grid-cols-2 gap-2">
          {outfitItems.map((item) => (
            <OutfitCard key={item.id} id={item.id as OutfitId} label={item.label} icon={item.icon} price={item.priceGold} companionType={companionType} inventory={inventory} />
          ))}
        </div>
      )}

      {tab === 'background' && (
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUND_CATALOG.map((item) => (
            <BackgroundCard key={item.id} id={item.id} label={item.label} icon={item.icon} price={item.priceGold} inventory={inventory} />
          ))}
        </div>
      )}
    </div>
  )
}

function OutfitCard({
  id,
  label,
  icon,
  price,
  companionType,
  inventory,
}: {
  id: OutfitId
  label: string
  icon: string
  price: number
  companionType: CompanionType
  inventory: MockInventory
}) {
  const owned = inventory.ownedOutfits.has(id)
  const equipped = owned && inventory.equippedOutfit[companionType] === id
  const canAfford = inventory.gold >= price

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs font-semibold text-amber-900">{label}</p>
      {price === 0 ? (
        <p className="text-[10px] text-emerald-600">무료</p>
      ) : (
        <p className="flex items-center gap-0.5 text-[10px] text-amber-600">
          <Coins size={10} /> {price}
        </p>
      )}
      <ItemActionButton
        owned={owned}
        equipped={equipped}
        canAfford={canAfford}
        onBuy={() => inventory.purchaseOutfit(id)}
        onEquip={() => inventory.equipOutfit(companionType, id)}
      />
    </div>
  )
}

function BackgroundCard({
  id,
  label,
  icon,
  price,
  inventory,
}: {
  id: BackgroundId
  label: string
  icon: string
  price: number
  inventory: MockInventory
}) {
  const owned = inventory.ownedBackgrounds.has(id)
  const equipped = owned && inventory.equippedBackground === id
  const canAfford = inventory.gold >= price

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs font-semibold text-amber-900">{label}</p>
      {price === 0 ? (
        <p className="text-[10px] text-emerald-600">무료</p>
      ) : (
        <p className="flex items-center gap-0.5 text-[10px] text-amber-600">
          <Coins size={10} /> {price}
        </p>
      )}
      <ItemActionButton
        owned={owned}
        equipped={equipped}
        canAfford={canAfford}
        onBuy={() => inventory.purchaseBackground(id)}
        onEquip={() => inventory.equipBackground(id)}
      />
    </div>
  )
}

function ItemActionButton({
  owned,
  equipped,
  canAfford,
  onBuy,
  onEquip,
}: {
  owned: boolean
  equipped: boolean
  canAfford: boolean
  onBuy: () => void
  onEquip: () => void
}) {
  if (equipped) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
        <Check size={10} /> 장착 중
      </span>
    )
  }
  if (owned) {
    return (
      <button type="button" onClick={onEquip} className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50">
        장착하기
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!canAfford}
      className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2 py-0.5 text-[10px] font-bold text-white disabled:from-amber-200 disabled:to-amber-200 disabled:text-amber-400"
    >
      {canAfford ? '구매하기' : <Lock size={10} />}
    </button>
  )
}
