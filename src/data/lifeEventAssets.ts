import townSquare from '../assets/grow/life-events/town-square.webp'
import restaurantInterior from '../assets/grow/life-events/restaurant-interior.webp'
import storeInterior from '../assets/grow/life-events/store-interior.webp'
import classroomInterior from '../assets/grow/life-events/classroom-interior.webp'

// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): 사용자가 채팅에 붙여넣은 4장의 이미지를 실제 파일로
// 받아(houseofimagi.itch.io BG School Classroom, 무료 상업적 이용
// 에셋 / seaart.ai·booth.pm AI 생성 일러스트 2장 / 사용자 제공 마을
// 전경 1장) 아래처럼 등록한다. 텍스트 지시의 "N번째 이미지" 번호는
// 실제 내용과 어긋나 있었다(예: "마트/가게 내부(1번째 이미지)"라고
// 했지만 1번째로 첨부된 이미지는 교실 사진이었다) — 번호가 아니라
// 그림이 실제로 보여주는 내용(교실/약국·잡화점/마을 광장/식당)을
// 기준으로 맞춰 등록했다.
//  - 동네 전경: 심부름(ErrandEventModal)·알바(JobEventModal) 걷기
//    배경의 공통 "동네"로 쓴다. 알바는 기존에 이미 실제 이미지
//    (partTimeJobAssets.ts의 town-walk-bg.webp)를 쓰고 있었지만,
//    지시서가 "심부름/알바 공통 기본 배경"으로 명시해 이 새 이미지로
//    통일한다 — 기존 파일은 삭제하지 않고 그대로 둔다.
//  - 식당 내부: 밥 먹기(HungryEventModal) 도착 배경.
//  - 마트/가게 내부: 8세 심부름(ErrandEventModal, "두부 사오기") 도착
//    배경.
//  - 교실/학교 내부: 이번 PR에서는 어디에도 연결하지 않는다 — 안전하게
//    연결할 화면이 없다(10대 알바는 이미 설거지/서빙/편의점 3곳 전용
//    도착 이미지가 있고, 그 외의 "학습" 화면은 8세/10대 학습 로직
//    컴포넌트라 이번 지시서의 금지 사항("기존 8세 8문제 학습 로직 및
//    10대 레벨업 로직을 훼손하지 마세요")에 해당한다). 나중에 실제
//    교실 배경이 필요한 화면이 정해지면 이 export를 그대로 가져다
//    쓰면 된다.
export const TOWN_SQUARE_BG_SRC = townSquare
export const RESTAURANT_INTERIOR_SRC = restaurantInterior
export const STORE_INTERIOR_SRC = storeInterior
export const CLASSROOM_INTERIOR_SRC = classroomInterior
