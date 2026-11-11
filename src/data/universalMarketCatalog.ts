// 지시서(누리AI 만능마켓): 사용자가 제공한 "누리AI 만능마켓(백화점)"
// 컨셉 이미지의 10개 코너를 그대로 카테고리로 옮겼다. 이미 배포된
// "아이템 마켓"(ItemMarket, Gold 경제, 옷/배경 전용)과는 완전히
// 별개의 화면·카탈로그다 — ItemMarket의 코드/데이터/테스트는 전혀
// 건드리지 않았다.
//
// useMockWallet의 원화 가상 용돈을 그대로 쓴다(Gold가 아니다) — 참고
// 코드(NuriMarketShoppingApp)가 제안한 통화와 같다. 실제 DB에는 전혀
// 저장하지 않는 체험판 쇼핑으로, 구매 내역도 새로고침하면 사라진다
// (useMockInventory/useMockWallet과 같은 원칙).
export type MarketCategoryId =
  | 'career'
  | 'education'
  | 'agriculture'
  | 'travel'
  | 'creative'
  | 'household'
  | 'tools'
  | 'office'
  | 'fashion'
  | 'hobby'

export const MARKET_CATEGORY_LABEL: Record<MarketCategoryId, string> = {
  career: '직업관',
  education: '학습·교육관',
  agriculture: '농업·원예관',
  travel: '여행·레저관',
  creative: '창작·콘텐츠관',
  household: '생활·가전관',
  tools: '도구·연장관',
  office: '업무·사무관',
  fashion: '의상·패션관',
  hobby: '게임·취미관',
}

export interface MarketItem {
  id: string
  category: MarketCategoryId
  name: string
  price: number
  icon: string
}

export const UNIVERSAL_MARKET_CATALOG: MarketItem[] = [
  { id: 'career-doctor-kit', category: 'career', name: '의사 가운 세트', price: 25000, icon: '👩‍⚕️' },
  { id: 'career-firefighter-kit', category: 'career', name: '소방관 장비 세트', price: 25000, icon: '👨‍🚒' },
  { id: 'education-workbook', category: 'education', name: 'AI 맞춤형 학습 교재', price: 15000, icon: '📚' },
  { id: 'education-language', category: 'education', name: '외국어 회화 강좌', price: 20000, icon: '🌐' },
  { id: 'agriculture-seed-set', category: 'agriculture', name: '텃밭 씨앗 세트', price: 10000, icon: '🌱' },
  { id: 'agriculture-pot', category: 'agriculture', name: '화분 · 가드닝 도구', price: 18000, icon: '🪴' },
  { id: 'travel-backpack', category: 'travel', name: '여행용 배낭', price: 22000, icon: '🎒' },
  { id: 'travel-tent', category: 'travel', name: '캠핑 텐트', price: 35000, icon: '⛺' },
  { id: 'creative-camera', category: 'creative', name: '디지털 카메라', price: 40000, icon: '📷' },
  { id: 'creative-pen', category: 'creative', name: '디지털 드로잉 펜', price: 25000, icon: '🎨' },
  { id: 'household-fridge', category: 'household', name: '미니 냉장고', price: 45000, icon: '🧊' },
  { id: 'household-kettle', category: 'household', name: '전기 주전자', price: 12000, icon: '☕' },
  { id: 'tools-driver-set', category: 'tools', name: '드라이버 세트', price: 15000, icon: '🪛' },
  { id: 'tools-toolbox', category: 'tools', name: '공구함', price: 20000, icon: '🧰' },
  { id: 'office-laptop', category: 'office', name: '업무용 노트북', price: 50000, icon: '💻' },
  { id: 'office-planner', category: 'office', name: '다이어리 · 플래너', price: 8000, icon: '🗒️' },
  { id: 'fashion-hanbok', category: 'fashion', name: '전통 한복 커스텀 세트', price: 30000, icon: '👘' },
  { id: 'fashion-casual', category: 'fashion', name: '캐주얼 일상복', price: 18000, icon: '👕' },
  { id: 'hobby-drone', category: 'hobby', name: '스마트 무선 드론', price: 45000, icon: '🚁' },
  { id: 'hobby-figure', category: 'hobby', name: '미니어처 피규어', price: 12000, icon: '🧸' },
]
