import { companionForGender, genderForCompanion, normalizeGender } from '../../shared/characterGender'
import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Briefcase, BookOpen } from 'lucide-react'
import GrowGuideSheet from '../components/grow/GrowGuideSheet'
import { useAuth } from '../context/AuthContext'
import { useGrowth, type CompanionType } from '../context/GrowthContext'
import { PROFESSION_LABEL, EXAM_SUPPORTED_PROFESSIONS, type ProfessionId } from '../data/characterProfessions'
import type { CharacterPose } from '../components/grow/CharacterSprite'
import GameStage from '../components/grow/GameStage'
import GrowthHUD from '../components/grow/GrowthHUD'
import GameMenu, { type GameMenuAction } from '../components/grow/GameMenu'
import BottomSheet from '../components/grow/BottomSheet'
import InteractionPanel from '../components/grow/InteractionPanel'
import ExamPanel from '../components/grow/ExamPanel'
import ChatLogPanel from '../components/grow/ChatLogPanel'
import RecordsPanel from '../components/grow/RecordsPanel'
import StatGaugesPanel from '../components/grow/StatGauges'
import QuestBanner from '../components/grow/QuestBanner'
import ResourceBar from '../components/grow/ResourceBar'
import ProfessionPicker from '../components/grow/ProfessionPicker'
import TurnTransition from '../components/grow/TurnTransition'
import CustomizationRoom from '../components/grow/CustomizationRoom'
import ItemMarket from '../components/grow/ItemMarket'
import UniversalMarket from '../components/grow/UniversalMarket'
import BookstoreOutingOverlay, { type BookstoreOutingStage } from '../components/grow/BookstoreOutingOverlay'
import { computeStatGauges, dominantStatLabel } from '../data/characterStats'
import { appearanceTierForLevel } from '../data/characterAppearance'
import { AGE_TIER_STAGE_LABEL, toddlerProfessionGreeting, openingGreeting, ageNumberForLevel, type AgeTier } from '../data/characterAge'
import { computeActiveQuest } from '../data/characterQuests'
import { BACKGROUND_SCENES } from '../data/backgroundCatalog'
import { useMockInventory } from '../hooks/useMockInventory'
import { useMockWallet, GROW_INITIAL_ALLOWANCE_WON } from '../hooks/useMockWallet'
import OpeningProfileScreen, { type OpeningProfile } from '../components/grow/OpeningProfileScreen'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }

// 버그 수정(선택한 캐릭터·직업이 메인 화면에 반영되지 않는 문제): 두
// 캐릭터를 모두 만든 계정은 재접속/새로고침마다 기본값('nuri')으로
// 되돌아가 사용자가 실제로 쓰는 캐릭터(예: 두리 + 직업)가 아니라 늘
// 누리의 "직업 미선택" 상태가 먼저 보였다 — 어느 탭을 마지막으로
// 봤는지 저장해두는 로직이 아예 없었기 때문이다(기존 보정 로직은
// "둘 다 있으면 아무것도 하지 않는다"고 명시돼 있었다). 계정별로 마지막
// 선택 탭만 로컬에 저장해 재접속 시 그대로 복원한다 — 서버/DB에는
// 아무것도 추가하지 않는 순수 UI 상태다.
const LAST_COMPANION_STORAGE_PREFIX = 'nuri-ai:last-companion:'

function readLastCompanion(userId: number): CompanionType | null {
  try {
    const value = window.localStorage.getItem(`${LAST_COMPANION_STORAGE_PREFIX}${userId}`)
    return value === 'nuri' || value === 'duri' ? value : null
  } catch {
    return null
  }
}

function writeLastCompanion(userId: number, companionType: CompanionType) {
  try {
    window.localStorage.setItem(`${LAST_COMPANION_STORAGE_PREFIX}${userId}`, companionType)
  } catch {
    // 저장 실패(프라이빗 모드 등)해도 탭 전환 자체는 문제없이 동작해야
    // 하므로 조용히 무시한다 — 이 값은 편의용 복원일 뿐이다.
  }
}
const SHEET_TITLE: Record<GameMenuAction, string> = {
  teach: '가르치기 · 스스로 공부하기',
  'chat-log': '함께 나눈 대화',
  quiz: '문제 풀기',
  study: '가르치기 · 스스로 공부하기',
  growth: '성장 보기',
  customize: '커스터마이징 룸',
  market: '아이템 마켓',
  universalMarket: '만능마켓',
  album: '앨범 · 기록',
}
// PR #49 요청 3: 텍스트 입력 폼(InteractionPanel/ExamPanel)을 대체하지는
// 않지만("진짜로 학습 내용을 입력해야" 하는 기능이라 로직은 그대로
// 두고), 그 폼이 열리기 전에 짧은 "턴 진행" 연출을 한 번 보여준다.
// chat-log/growth/album은 그냥 기록을 보는 것이라 턴 연출이 어울리지
// 않아 대상에서 뺐다.
const TURN_TRANSITION_LABEL: Partial<Record<GameMenuAction, string>> = {
  teach: '지식을 가르치러 갑니다...',
  study: '스스로 공부하러 갑니다...',
  quiz: '문제를 준비하고 있어요...',
}

// 지시서(가르치기 완료 후 자동 식사 이벤트): 8~9살(toddler) 단계에서
// 가르치기/스스로 공부하기 저장이 이만큼 쌓이면 패널을 닫고 "배고프다"
// 말풍선 → (체험판 용돈 차감) → 맛있게 먹는 연출로 이어지는 짧은
// 이벤트를 보여준다. 실제 네이버 플레이스 API 연동이나 실제 결제는
// 하지 않는다 — '이모네김밥'은 이 체험판 안에서만 쓰이는 식당 이름
// 플레이버 텍스트이고, 차감도 실제 DB가 아니라 useMockWallet.ts의
// 체험판 용돈에서만 일어난다.
const MEAL_TRIGGER_SAVE_COUNT = 3
const MEAL_COST_WON = 10_000
const MEAL_RESTAURANT_LABEL = '이모네김밥'

// 지시서(8~9살 기초지식 완료 후 서점 외출 미션): 식사 이벤트와 같은
// "8~9살 가르치기 3회 저장마다" 신호를 재사용하되, 번갈아(식사 →
// 서점 → 식사 → 서점...) 띄워서 서로 겹치지 않게 한다. 실제 네이버
// 스마트플레이스 API 연동이나 실제 리뷰 게시는 하지 않는다 — API 키가
// 없고, 실제 존재하는 특정 서점 체인 이름을 그대로 쓰면서 "진짜 리뷰를
// 남긴다"처럼 보이면 안 되기 때문에(CLAUDE.md 9번 지식재산권 지침),
// 이 체험판 전용 가상 서점으로 구현했다 — 자세한 설계 의도는
// BookstoreOutingOverlay.tsx 참고.
const BOOKSTORE_NAME = '늘봄서점 자양점'
const BOOKSTORE_REWARD_ITEM = '인체해부도 교구'
const BOOKSTORE_POINT_REWARD = 300

// 지시서(생활·경제 전략 이벤트 — 알바/돈 벌기): 식사·서점 이벤트와 같은
// "3회 저장" 신호를 3단계로 돌려(식사 → 서점 → 알바 → 식사 → ...)
// 세 번째 자리에 넣는다. 체험판 용돈(useMockWallet)에만 더해지고,
// 실제 character.exp/DB는 건드리지 않는다 — 지출(식사)과 짝을 이루는
// 수입 이벤트.
const PART_TIME_JOB_EARNING_WON = 20_000

// 지시서(문제 풀기 용돈 이벤트): "문제 풀기"에서 정답을 맞힐 때마다 쌓는
// 누적 횟수로 두 가지 독립된 이벤트를 띄운다 — 3의 배수번째 정답마다
// 보상(반복), 정확히 5번째 정답에서 간식 이벤트(1회성). 둘 다 체험판
// 용돈(useMockWallet)에만 영향을 주고, 실제 퀴즈 채점·XP 지급(서버
// 권위값인 character.exp)은 전혀 건드리지 않는다 — ExamPanel이 이미
// 서버에서 정답을 채점한 "뒤에" 그 결과만 넘겨받아 반응할 뿐이다.
const QUIZ_CORRECT_REWARD_INTERVAL = 3
const QUIZ_CORRECT_REWARD_WON = 30_000
const QUIZ_SNACK_TRIGGER_COUNT = 5
const QUIZ_SNACK_COST_WON = 20_000

// PR #46: /grow를 카드형 웹페이지에서 캐릭터 중심 게임 화면으로
// 재구성. 학습·검증·퀴즈·시험·XP·DB 저장 로직은 전부 기존
// GrowthContext/InteractionPanel/ExamPanel을 그대로 재사용하고(요청 9),
// 이 파일은 그 기능들을 어떻게 보여줄지(레이아웃·전환·연출)만 바꾼다.
// PR #49: 스테이지+HUD+스탯+퀘스트+메뉴를 하나의 목재 프레임으로
// 합쳐서, 흰/크림색 카드가 줄줄이 쌓인 웹페이지 느낌에서 벗어났다.
export default function GrowPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { characters, loading, createCharacter, setProfession, listMessages, getExam, listKnowledge, getUsage } = useGrowth()

  const [selected, setSelected] = useState<CompanionType>('nuri')
  useEffect(() => {
    if (characters.some(c => c.companionType === selected)) {
      console.log('[gender:render]', { gender: genderForCompanion(selected), companionType: selected, characterName: selected === 'nuri' ? '누리' : '두리' })
    }
  }, [characters, selected])
  const [error, setError] = useState<string | null>(null)
  // Stage 1(오프닝 프로필): 신규 캐릭터를 만들 때 바로 생성하지 않고
  // 이름·생일·거주지역·자유 직업을 먼저 입력받는 화면을 거친다 — 어느
  // 캐릭터(누리/두리)를 만드는 중인지만 들고 있는다.
  const [onboardingFor, setOnboardingFor] = useState<CompanionType | null>(null)
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false)
  const [showProfessionPicker, setShowProfessionPicker] = useState(false)
  // 지시서("누리AI 키우기 간단 설명서"): 성장 규칙/직업 변경/미션
  // 진행 방법을 보여주는 읽기 전용 도움말 패널 — 다른 로직과 완전히
  // 독립된 단일 boolean 상태라, 미션/진화/직업 변경 흐름에는 전혀
  // 영향을 주지 않는다.
  const [showGuide, setShowGuide] = useState(false)
  // PR #65: 'custom'으로 바꾸려는 변경 확인 모달에서는 라벨이 없으니
  // (PROFESSION_LABEL엔 'custom' 전용 고정 문구만 있다) 입력한 텍스트를
  // 함께 들고 있어야 확인 문구에 그대로 보여줄 수 있다.
  const [pendingChange, setPendingChange] = useState<{ profession: ProfessionId; customLabel?: string } | null>(null)
  const [savingProfession, setSavingProfession] = useState(false)
  const [openSheet, setOpenSheet] = useState<GameMenuAction | null>(null)
  const [turnTransition, setTurnTransition] = useState<GameMenuAction | null>(null)
  const [pose, setPose] = useState<CharacterPose>('idle')
  const [bubbleText, setBubbleText] = useState<string | null>(null)
  const [recentLine, setRecentLine] = useState<string | null>(null)
  const [examPassed, setExamPassed] = useState<boolean | null>(null)
  const [xpPopup, setXpPopup] = useState<number | null>(null)
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, aiGenerated: 0 })
  const [messageTotal, setMessageTotal] = useState(0)
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null)
  // PR #63: 연령대 "진화"(6미션 게이트 통과) 전용 축하 연출 — 평범한
  // 레벨업 배너와 별개로, character.ageTier가 바뀌는 순간만 지켜본다
  // (InteractionPanel/ExamPanel을 전혀 건드리지 않는 기존 leveledUpTo
  // 패턴과 동일한 원칙).
  const [evolvedTo, setEvolvedTo] = useState<AgeTier | null>(null)
  // 지시서(서점 외출 미션): 외출 보상으로 뜨는 "+300P" 팝업 — 실제
  // character.exp(ResourceBar의 "포인트")는 서버 권위값이라 건드리지
  // 않고, 순수 연출용 숫자다(아래 triggerBookstoreOuting 참고).
  const [pointsPopup, setPointsPopup] = useState<number | null>(null)
  // 지시서(서점 외출 미션): 가는 길/도착/오는 길 3단계 — null이면
  // 외출 중이 아님.
  const [bookstoreOuting, setBookstoreOuting] = useState<BookstoreOutingStage | null>(null)
  // 지시서(알바/경제 활동 이벤트): 잠깐 "일하는 중" 턴 연출 중인지 —
  // 기존 TurnTransition을 그대로 재사용한다.
  const [workingOnJob, setWorkingOnJob] = useState(false)
  // 알바 보상으로 뜨는 "+N원" 팝업 — pointsPopup과 같은 순수 연출용.
  const [moneyPopup, setMoneyPopup] = useState<number | null>(null)
  // PR #49: 상단 리소스 바의 "행동력" — 오늘 남은 가르치기/스스로
  // 공부하기 횟수(계정 전체 하루 한도, 캐릭터별이 아님). 소비 없는
  // 조회(getUsage)만 쓴다.
  const [usage, setUsage] = useState({ teachRemaining: 0, teachLimit: 0, studyRemaining: 0, studyLimit: 0 })
  // PR #50: 커스터마이징/마켓 뼈대 — 모의 재화·보유·장착 상태(새로고침
  // 시 초기화, 실제 DB 저장 없음). 자세한 설계 의도는 useMockInventory.ts
  // 참고.
  const inventory = useMockInventory()
  // Stage 1(오프닝 프로필): 초기 가상 용돈(GROW_INITIAL_ALLOWANCE_WON,
  // 10만 원)의 체험판 전용 상태 — 실제 DB에 저장되지 않는다
  // (useMockWallet.ts 참고). Preview/Production DB 분리가 아직 검증되지
  // 않은 상태라, 이번 단계에서는 새 DB 쓰기를 하나도 추가하지 않기로
  // 했다.
  const wallet = useMockWallet()

  const character = characters.find((c) => c.companionType === selected) ?? null
  // PR #48: "지금 뭘 하면 좋을지"를 한 곳에서만 계산한다 — PR #46의
  // goalText를 대체한다. GrowthHUD의 문구와 QuestBanner/말풍선이 서로
  // 다른 소스를 보여주며 어긋나는 일이 없도록 한다.
  const quest = computeActiveQuest({
    profession: character?.profession ?? null,
    professionLabel: character?.profession
      ? character.profession === 'custom'
        ? character.customProfessionLabel ?? PROFESSION_LABEL.custom
        : PROFESSION_LABEL[character.profession]
      : null,
    knowledgeTotal: knowledgeStats.total,
    examPassed,
  })
  const prevExpRef = useRef<number | null>(null)
  const prevLevelRef = useRef<number | null>(null)
  const prevAgeTierRef = useRef<AgeTier | null>(null)
  const prevOpenSheetRef = useRef<GameMenuAction | null>(null)
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 지시서(캐릭터 인사말 말풍선): 프로필 생성 직후 0.5초 뒤 띄우는
  // 인사말 말풍선 전용 상태 — 그 지연(500ms) 예약 타이머와, 지금 뜬
  // 말풍선이 "클릭하면 바로 닫을 수 있는 그 인사말"인지 표시하는
  // 플래그. 다른 showBubble 호출(식사·알바 등 기존 이벤트)에는 전혀
  // 영향을 주지 않는다 — showBubble은 매 호출마다 이 플래그를 false로
  // 되돌린 뒤, 이 인사말 호출에서만 다시 true로 켠다.
  const openingGreetingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissibleGreetingRef = useRef(false)
  const levelUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const evolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 지시서(가르치기 완료 후 자동 식사 이벤트): "배고프다" → "맛있게
  // 먹는 중" 두 단계로 이어지는 연출에 쓰는 타임아웃들 — 언마운트 시
  // 전부 정리해야 한다(여러 개가 쌓일 수 있어 배열로 관리).
  const mealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // 지시서(서점 외출 미션): "가는 길 → 도착 → 오는 길" 연출에 쓰는
  // 타임아웃들 — mealTimeoutsRef와 같은 이유로 배열 관리 + 언마운트
  // 시 정리한다.
  const outingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // 지시서(연령대별 스테이지 볼륨업): 가르치기/스스로 공부하기 저장이
  // 몇 번 쌓였는지 — 연령대 전용 제한 없이 모든 단계에서 똑같이 센다.
  // 화면에 표시하지 않는 내부 카운터라 리렌더를 유발할 필요가 없어
  // ref로 둔다. DB에 저장되지 않는 세션 전용 값이라, 캐릭터를 전환하면
  // 아래 효과에서 0으로 되돌린다.
  const knowledgeSaveCountRef = useRef(0)
  // 지시서(서점 외출 미션, 알바/경제 활동 이벤트): 식사·서점·알바
  // 세 이벤트가 매번 같은 "3회 저장" 신호를 공유하므로, 셋이 순서대로
  // 돌아가며 뜨도록 한다(0=다음은 식사, 1=다음은 서점, 2=다음은 알바) —
  // 캐릭터 전환 시 함께 초기화한다.
  const outingCycleRef = useRef<0 | 1 | 2>(0)
  // 지시서(문제 풀기 용돈 이벤트): "문제 풀기"에서 정답을 맞힌 누적
  // 횟수 — knowledgeSaveCountRef와 같은 이유(화면에 직접 안 보이는
  // 세션 전용 카운터)로 ref에 두고, 캐릭터 전환 시 함께 초기화한다.
  const quizCorrectCountRef = useRef(0)
  // 한 번 보여준 캐릭터는 같은 페이지 방문 동안 다시 안 보여주되, 탭을
  // 왔다갔다 전환해도(누리→두리→누리) 각자 한 번씩은 보장하기 위해
  // Set으로 추적한다(단일 ref 값이면 마지막 캐릭터만 기억해 전환 시
  // 오작동한다).
  const questBubbleShownRef = useRef<Set<CompanionType>>(new Set())
  // 진입 시 한 번 예약되는 "캐릭터가 먼저 말을 거는" 말풍선(900ms 지연)
  // 의 타이머 — 그 전에 사용자가 다른 상호작용(소품 클릭 등)으로 먼저
  // showBubble을 호출하면, 이 지연 타이머가 나중에 그 말풍선을 덮어쓰지
  // 않도록 취소해야 한다(아래 showBubble 참고).
  const questBubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 로그인한 계정이 두리만 갖고 있는 경우처럼, 기본값('nuri')과 실제
  // 보유 캐릭터가 어긋날 수 있어 보정한다. 캐릭터 목록이 처음 로딩된
  // 그 순간에만(didRestoreSelectionRef) 마지막으로 보던 탭을 로컬
  // 저장소에서 복원한다 — 둘 다 있을 때도 적용되어야 하는 보정이라,
  // 이후의 "선택한 탭이 더 이상 존재하지 않을 때만 보정" 로직과는
  // 별도로 한 번만 돈다(사용자가 직접 고른 탭을 나중에 덮어쓰지 않음).
  const didRestoreSelectionRef = useRef(false)
  useEffect(() => {
    if (characters.length === 0) return
    if (!didRestoreSelectionRef.current) {
      didRestoreSelectionRef.current = true
      const remembered = user ? readLastCompanion(user.id) : null
      if (remembered && remembered !== selected && characters.some((c) => c.companionType === remembered)) {
        setSelected(remembered)
        return
      }
    }
    if (characters.some((c) => c.companionType === selected)) return
    setSelected(characters[0].companionType)
  }, [characters, selected, user])

  // 탭 전환 UI(수동 클릭)와 온보딩 완료 양쪽에서 똑같이 쓰는, "선택한
  // 캐릭터를 바꾸고 다음 재접속을 위해 기억해두는" 단일 경로.
  const selectCompanion = (companionType: CompanionType) => {
    setSelected(companionType)
    if (user) writeLastCompanion(user.id, companionType)
  }

  // 캐릭터를 전환할 때마다 "오늘의 목표"/"최근 기록"/4개 스탯 게이지에
  // 쓸 가벼운 데이터를 조용히 미리 불러온다 — 셋 다 이미 있는 읽기
  // 전용 GET이라(Gemini 호출 없음, 비용 없음) 추가 과금이나 새 API
  // 없이 재사용만 한다. 스탯 게이지 자체는 characterStats.ts가 이
  // 데이터를 0~100으로 환산한 "표시용" 값일 뿐, 새로 저장되는 값은
  // 아니다(PR #47 체크포인트 1).
  useEffect(() => {
    if (!character) return
    setExamPassed(null)
    setRecentLine(null)
    setKnowledgeStats({ total: 0, aiGenerated: 0 })
    setMessageTotal(0)
    knowledgeSaveCountRef.current = 0
    outingCycleRef.current = 0
    quizCorrectCountRef.current = 0
    let cancelled = false
    // PR #51(직업 선택 제한 해제): "문제 풀기"를 지원하지 않는 직업(48개)
    // 에서는 getExam이 항상 400을 받게 되므로, 애초에 호출하지 않는다.
    if (character.profession && EXAM_SUPPORTED_PROFESSIONS.has(character.profession)) {
      getExam(character.companionType)
        .then((r) => {
          if (!cancelled) setExamPassed(r.alreadyPassed)
        })
        .catch(() => {})
    }
    listMessages(character.companionType, { limit: 5 })
      .then((r) => {
        if (!cancelled) {
          setMessageTotal(r.total)
          if (r.messages.length > 0) setRecentLine(r.messages[r.messages.length - 1].content)
        }
      })
      .catch(() => {})
    listKnowledge(character.companionType, { limit: 100 })
      .then((r) => {
        if (!cancelled) {
          const aiGenerated = r.entries.filter((e) => e.source === 'ai_generated').length
          setKnowledgeStats({ total: r.total, aiGenerated })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [character?.companionType, character?.profession, getExam, listMessages, listKnowledge])

  // 행동력(usage)은 캐릭터별이 아니라 계정 전체 하루 한도라, 로그인
  // 시점에 한 번 불러온다.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getUsage()
      .then((u) => {
        if (!cancelled) setUsage(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, getUsage])

  // 가르치기/스스로 공부하기/문제 풀기 패널을 닫으면(방금 그 안에서
  // 행동력을 썼을 수 있으니) 행동력을 다시 불러와 화면에 반영한다.
  useEffect(() => {
    if (prevOpenSheetRef.current && !openSheet) {
      getUsage()
        .then(setUsage)
        .catch(() => {})
    }
    prevOpenSheetRef.current = openSheet
  }, [openSheet, getUsage])

  // XP가 늘어나면(패널이 뭘 했든 상관없이) 잠깐 "+N XP" 팝업만 띄운다 —
  // InteractionPanel/ExamPanel 내부를 전혀 건드리지 않고, 결과로 바뀐
  // character.exp만 지켜보는 방식이라 기존 로직과 완전히 분리돼 있다.
  useEffect(() => {
    if (!character) return
    const prev = prevExpRef.current
    if (prev !== null && character.exp > prev) {
      const gained = character.exp - prev
      setXpPopup(gained)
      const t = window.setTimeout(() => setXpPopup(null), 1800)
      return () => window.clearTimeout(t)
    }
    prevExpRef.current = character.exp
  }, [character?.exp])
  useEffect(() => {
    prevExpRef.current = character?.exp ?? null
  }, [character?.companionType])

  // 레벨이 실제로 올랐을 때만(지식 저장/퀴즈/시험 하나로는 보통 레벨까지
  // 안 오름) +N XP 팝업과 별개로 더 눈에 띄는 "레벨업" 연출을 띄운다 —
  // 이 효과도 InteractionPanel/ExamPanel을 전혀 건드리지 않고 결과로
  // 바뀐 character.level만 지켜보는 방식이다.
  useEffect(() => {
    if (!character) return
    const prev = prevLevelRef.current
    if (prev !== null && character.level > prev) {
      setLeveledUpTo(character.level)
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current)
      levelUpTimeoutRef.current = setTimeout(() => setLeveledUpTo(null), 2200)
    }
    prevLevelRef.current = character.level
  }, [character?.level])
  useEffect(() => {
    prevLevelRef.current = character?.level ?? null
  }, [character?.companionType])

  // PR #63: 연령대가 실제로 바뀌었을 때만(6미션 게이트를 막 통과했을
  // 때만) 레벨업과 별개로 더 눈에 띄는 "진화" 연출을 띄운다 — 레벨만
  // 올라서는 ageTier가 안 바뀔 수 있으므로(미션이 안 끝났으면 서버가
  // ageTier를 그대로 고정해 보낸다) 평범한 레벨업과 자연히 구분된다.
  useEffect(() => {
    if (!character) return
    const prev = prevAgeTierRef.current
    if (prev !== null && character.ageTier !== prev) {
      setEvolvedTo(character.ageTier)
      if (evolveTimeoutRef.current) clearTimeout(evolveTimeoutRef.current)
      evolveTimeoutRef.current = setTimeout(() => setEvolvedTo(null), 2800)
    }
    prevAgeTierRef.current = character.ageTier
  }, [character?.ageTier])
  useEffect(() => {
    prevAgeTierRef.current = character?.ageTier ?? null
  }, [character?.companionType])

  // PR #48 "게임 루프 강화": 캐릭터가 먼저 말을 거는 효과 — 캐릭터를
  // 고를 때마다(또는 처음 들어왔을 때) 한 번만, 지금 추천하는 퀘스트
  // 문구를 말풍선으로 띄운다. examPassed를 아직 못 받아온 상태(로딩 중)
  // 에는 기다렸다가 실제 값이 정해진 뒤에 띄워서 "틀린 추천"이 잠깐
  // 보였다 바뀌는 깜빡임을 막는다.
  useEffect(() => {
    if (!character) return
    if (questBubbleShownRef.current.has(character.companionType)) return
    if (character.profession && examPassed === null) return
    // "이미 보여줬다"는 예약 시점이 아니라 실제로 뜬 시점에 표시한다 —
    // examPassed/quest.text가 서로 다른 타이밍에 차례로 들어오면(시험
    // 결과 먼저, 지식 개수 나중 등) 이 effect가 여러 번 다시 실행되는데,
    // 예약 시점에 바로 "표시함"으로 마크해버리면 재실행 때마다 걸리는
    // 취소(cleanup)만 일어나고 다시 예약은 안 되어 말풍선이 영영 안
    // 뜨는 문제가 있었다(CI에서 재현됨). 매번 최신 quest.text로 다시
    // 예약하고, 실제로 발동할 때만 "표시함"으로 마크한다.
    const companionType = character.companionType
    const text = quest.text
    questBubbleTimeoutRef.current = setTimeout(() => {
      questBubbleTimeoutRef.current = null
      questBubbleShownRef.current.add(companionType)
      showBubble(text)
    }, 900)
    return () => {
      if (questBubbleTimeoutRef.current) {
        clearTimeout(questBubbleTimeoutRef.current)
        questBubbleTimeoutRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.companionType, character?.profession, examPassed, quest.text])

  useEffect(() => {
    return () => {
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
      if (openingGreetingTimeoutRef.current) clearTimeout(openingGreetingTimeoutRef.current)
      if (levelUpTimeoutRef.current) clearTimeout(levelUpTimeoutRef.current)
      if (evolveTimeoutRef.current) clearTimeout(evolveTimeoutRef.current)
      if (turnTransitionTimeoutRef.current) clearTimeout(turnTransitionTimeoutRef.current)
      const mealTimeouts = mealTimeoutsRef.current
      mealTimeouts.forEach(clearTimeout)
      const outingTimeouts = outingTimeoutsRef.current
      outingTimeouts.forEach(clearTimeout)
    }
  }, [])

  const showBubble = (text: string, durationMs = 3200) => {
    // 진입 시 예약된 "먼저 말 거는" 말풍선이 아직 안 떴다면, 지금 다른
    // 이유로 말풍선을 띄우는 이 호출이 먼저다 — 나중에 그 지연 타이머가
    // 뒤늦게 발동해 지금 막 띄운 말풍선을 덮어쓰지 않도록 취소한다.
    if (questBubbleTimeoutRef.current) {
      clearTimeout(questBubbleTimeoutRef.current)
      questBubbleTimeoutRef.current = null
    }
    // 이 호출이 "클릭하면 바로 닫히는 인사말"이 아니라면 항상 꺼둔다 —
    // 인사말 호출 쪽(handleOnboardingComplete)에서만 명시적으로 다시 켠다.
    dismissibleGreetingRef.current = false
    setBubbleText(text)
    if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
    bubbleTimeoutRef.current = setTimeout(() => setBubbleText(null), durationMs)
  }

  // Stage 1(오프닝 프로필): OpeningProfileScreen이 모은 입력값을 받아
  // 실제로 캐릭터를 만든다. 캐릭터 생성·직업 저장은 PR #65까지 이미
  // 있는 기존 API를 그대로 재사용한다(새로운 쓰기 위험이 아님) — 이름·
  // 생일·거주지역·초기 용돈은 어디에도 저장하지 않고 화면(말풍선·
  // wallet 체험판 상태)에만 반영한다.
  const handleOnboardingComplete = async (profile: OpeningProfile) => {
    if (!onboardingFor) return
    const gender = normalizeGender(profile.gender)
    const companionType = gender ? companionForGender(gender) : onboardingFor
    console.log('[gender:submit]', { gender, companionType })
    setOnboardingSubmitting(true)
    setError(null)
    try {
      await createCharacter(companionType, gender ?? undefined)
      if (profile.profession) {
        await setProfession(companionType, 'custom', profile.profession)
      }
      wallet.grantInitialAllowance(GROW_INITIAL_ALLOWANCE_WON)
      selectCompanion(companionType)
      setOnboardingFor(null)

      // 지시서(캐릭터 인사말 말풍선): AI 키우기 메인 화면에 막 들어왔을
      // 때 0.5초 뒤 페이드인되는 인사말 — 입력한 이름·직업을 그대로
      // 끼워 넣는다(기존 toddlerProfessionGreeting과 달리 이름도 포함).
      // 5초 후 자동으로 사라지거나, 그 전에 캐릭터를 탭하면 바로 닫힌다
      // (아래 onTapCharacter 참고). 이름·직업은 이 onComplete 콜백에만
      // 잠깐 존재하는 값이라(OpeningProfileScreen도 어디에도 저장하지
      // 않음, 생일·거주지역과 같은 원칙) 재방문 시에는 다시 보여줄 수
      // 없다 — "프로필 생성 직후"라는 지시서의 범위와 정확히 일치한다.
      const greetingName = profile.name.trim()
      const greetingProfession = profile.profession.trim() || null
      openingGreetingTimeoutRef.current = setTimeout(() => {
        openingGreetingTimeoutRef.current = null
        showBubble(openingGreeting(greetingName, greetingProfession), 5000)
        dismissibleGreetingRef.current = true
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : '캐릭터를 만드는 중 오류가 발생했어요.')
    } finally {
      setOnboardingSubmitting(false)
    }
  }

  const applyProfession = async (profession: ProfessionId, customLabel?: string) => {
    if (!character) return
    // PR #52 요청 2번: 처음 직업을 고르는 순간(이전까지 직업이 없었고,
    // 아직 8~9살 toddler 단계)에만 아동 말투 인사를 보여준다 — 나중에
    // "직업 변경"으로 바꿀 때는 이미 성장한 캐릭터라 이 대사가 어색하다.
    const isFirstPick = !character.profession && ageTier === 'toddler'
    setSavingProfession(true)
    setError(null)
    try {
      await setProfession(character.companionType, profession, customLabel)
      setPendingChange(null)
      if (isFirstPick) {
        // PR #65: 'custom'이면 방금 입력한 텍스트를, 아니면 기존처럼
        // PROFESSION_LABEL을 쓴다.
        showBubble(toddlerProfessionGreeting(profession === 'custom' ? customLabel ?? PROFESSION_LABEL.custom : PROFESSION_LABEL[profession]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '직업을 저장하는 중 오류가 발생했어요.')
    } finally {
      setSavingProfession(false)
    }
  }

  // InteractionPanel/ExamPanel reset pose to 'idle' from a cleanup effect
  // keyed on this callback's identity — if this weren't memoized, every
  // unrelated GrowPage re-render (e.g. the recentLine/examPassed prefetch
  // effects resolving) would hand them a new onPoseChange reference and
  // immediately re-trigger that cleanup, snapping the pose straight back
  // to idle right after a panel just set it to happy/sad.
  const handlePoseChange = useCallback((next: CharacterPose) => {
    setPose(next)
    if (next === 'happy') showBubble('좋아요! 잘 하고 있어요!')
    if (next === 'sad') showBubble('음... 다시 해볼까요?')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 소품(책상/책 등)을 눌러도 뭔가 반응이 오도록 — 실제 패널을 열지는
  // 않고, 말풍선으로 짧은 반응만 준다(요청 1: 클릭 가능한 소품 인터랙션).
  const handlePropClick = (emoji: string) => {
    showBubble(`${emoji} 오늘도 여기 있네요!`)
  }

  // 지시서(가르치기 완료 후 자동 식사 이벤트): 패널을 닫고 "배고프다"
  // 말풍선을 먼저 띄운 뒤, 잠시 뒤 체험판 용돈에서 식사비를 차감하고
  // 맛있게 먹는 포즈/말풍선으로 이어간다. 체험판 용돈을 아직 지급받지
  // 않은 캐릭터(wallet.balanceWon === null, Stage 1 온보딩을 거치지
  // 않은 기존 캐릭터)는 차감 없이 연출만 보여준다.
  const triggerMealBreak = () => {
    setOpenSheet(null)
    showBubble(`배가 고파요! ${MEAL_RESTAURANT_LABEL}에 가서 김밥 한 줄 먹고 올게요!`)
    const t1 = setTimeout(() => {
      if (wallet.balanceWon !== null) wallet.spend(MEAL_COST_WON)
      setPose('eating')
      showBubble(`냠냠, ${MEAL_RESTAURANT_LABEL} 김밥 진짜 맛있어요! 🍙`)
      const t2 = setTimeout(() => setPose('idle'), 2600)
      mealTimeoutsRef.current.push(t2)
    }, 1400)
    mealTimeoutsRef.current.push(t1)
  }

  // 지시서(서점 외출 미션): 패널을 닫고 "+300P" 팝업 + 서점으로 가야
  // 하는 이유를 말풍선으로 띄운 뒤, 걸어가는 연출 → 도착(리뷰 남기기
  // 카드) → 리뷰 제출 시 교구 획득 → 걸어오는 연출 → 귀가로 이어진다.
  // handleBookstoreReviewSubmit이 사용자의 "리뷰 남기기" 클릭을 기다려야
  // 하므로, 식사 이벤트(순수 타임아웃 연쇄)와 달리 중간에 사용자 입력이
  // 섞인다.
  const triggerBookstoreOuting = () => {
    setOpenSheet(null)
    inventory.addGold(BOOKSTORE_POINT_REWARD)
    setPointsPopup(BOOKSTORE_POINT_REWARD)
    const popupTimeout = setTimeout(() => setPointsPopup(null), 1800)
    outingTimeoutsRef.current.push(popupTimeout)
    showBubble('한의사가 되기 위해 인체해부도가 필요해요! 서점에 다녀올게요!')
    const t1 = setTimeout(() => {
      setBookstoreOuting('walking-there')
    }, 1400)
    outingTimeoutsRef.current.push(t1)
  }

  // "가는 길" 걷기 애니메이션이 한 바퀴(2초) 끝나면 도착 카드로 넘어간다
  // — BookstoreOutingOverlay 쪽 CSS 애니메이션 길이와 맞춘 고정 지연.
  useEffect(() => {
    if (bookstoreOuting !== 'walking-there') return
    const t = setTimeout(() => {
      setBookstoreOuting('arrived')
      showBubble(`${BOOKSTORE_NAME}에 도착했어요!`)
    }, 2000)
    outingTimeoutsRef.current.push(t)
    return () => clearTimeout(t)
  }, [bookstoreOuting])

  // "오는 길"도 같은 길이만큼 걷고 나면 외출을 완전히 종료한다.
  useEffect(() => {
    if (bookstoreOuting !== 'walking-back') return
    const t = setTimeout(() => {
      setBookstoreOuting(null)
      showBubble('다녀왔어요!')
    }, 2000)
    outingTimeoutsRef.current.push(t)
    return () => clearTimeout(t)
  }, [bookstoreOuting])

  // 도착 카드의 "⭐ 리뷰 남기고 교구 받기" 버튼 — 실제 네이버 리뷰를
  // 게시하지 않는, 이 체험판 안에서만 끝나는 보상 트리거다.
  const handleBookstoreReviewSubmit = () => {
    showBubble(`${BOOKSTORE_REWARD_ITEM}를 손에 넣었어요! 다시 집으로 돌아갈게요.`)
    setBookstoreOuting('walking-back')
  }

  // 지시서(생활·경제 전략 이벤트 — 알바/돈 벌기): 패널을 닫고 짧게
  // "일하는 중" 연출(기존 TurnTransition 재사용)을 보여준 뒤, 체험판
  // 용돈에 수입을 더한다. 지갑이 아직 없는 캐릭터(Stage 1 온보딩 전)는
  // 연출만 보여주고 금액 변화는 건너뛴다(식사/서점 이벤트와 동일 원칙).
  const triggerPartTimeJob = () => {
    setOpenSheet(null)
    showBubble('용돈을 벌고 싶어요! 잠깐 아르바이트하고 올게요!')
    const t1 = setTimeout(() => {
      setWorkingOnJob(true)
      const t2 = setTimeout(() => {
        setWorkingOnJob(false)
        wallet.earn(PART_TIME_JOB_EARNING_WON)
        setMoneyPopup(PART_TIME_JOB_EARNING_WON)
        const t3 = setTimeout(() => setMoneyPopup(null), 1800)
        outingTimeoutsRef.current.push(t3)
        showBubble(`아르바이트해서 ${PART_TIME_JOB_EARNING_WON.toLocaleString('ko-KR')}원 벌었어요! 💰`)
      }, 1800)
      outingTimeoutsRef.current.push(t2)
    }, 1400)
    outingTimeoutsRef.current.push(t1)
  }

  // InteractionPanel이 지식 저장에 성공할 때마다 호출된다 — 지정된
  // 횟수(MEAL_TRIGGER_SAVE_COUNT)를 채울 때마다 식사 → 서점 외출 →
  // 알바 이벤트를 순서대로 띄운 뒤 다시 0부터 센다. 지시서(연령대별
  // 스테이지 볼륨업: "경제 전략 루틴이 각 스테이지에 자연스럽게
  // 녹아들도록")에 따라 8~9살 전용이던 제한을 없애고 모든 연령대에서
  // 똑같이 동작한다 — 연령대가 올라가 한 단계를 졸업하는 데 필요한
  // 지식 개수가 늘어날수록(6→10→...→50) 이 3회 단위 휴식 이벤트도
  // 자연히 더 자주 끼어든다.
  const handleKnowledgeSaved = () => {
    if (!character) return
    knowledgeSaveCountRef.current += 1
    if (knowledgeSaveCountRef.current >= MEAL_TRIGGER_SAVE_COUNT) {
      knowledgeSaveCountRef.current = 0
      if (outingCycleRef.current === 0) {
        outingCycleRef.current = 1
        triggerMealBreak()
      } else if (outingCycleRef.current === 1) {
        outingCycleRef.current = 2
        triggerBookstoreOuting()
      } else {
        outingCycleRef.current = 0
        triggerPartTimeJob()
      }
    }
  }

  // 지시서(문제 풀기 용돈 이벤트): ExamPanel이 서버 채점 결과 "정답"일
  // 때만 호출한다 — 오답은 세지 않는다. 두 트리거는 독립적이라(3의
  // 배수와 정확히 5는 절대 동시에 맞아떨어지지 않음) if/else로 묶지
  // 않는다. 패널은 식사/서점/알바 이벤트와 같은 이유로 닫아서, 스테이지
  // 위에 뜨는 팝업·말풍선이 모달에 가리지 않게 한다.
  const handleQuizAnswerCorrect = () => {
    if (!character) return
    quizCorrectCountRef.current += 1
    const count = quizCorrectCountRef.current

    if (count % QUIZ_CORRECT_REWARD_INTERVAL === 0) {
      setOpenSheet(null)
      if (wallet.balanceWon !== null) wallet.earn(QUIZ_CORRECT_REWARD_WON)
      setMoneyPopup(QUIZ_CORRECT_REWARD_WON)
      const t = setTimeout(() => setMoneyPopup(null), 1800)
      outingTimeoutsRef.current.push(t)
      showBubble(`문제를 맞혀서 ${QUIZ_CORRECT_REWARD_WON.toLocaleString('ko-KR')}원 받았어요! 💰`)
    }

    if (count === QUIZ_SNACK_TRIGGER_COUNT) {
      setOpenSheet(null)
      showBubble('배가 고파요! 간식 먹고 올게요!')
      const t1 = setTimeout(() => {
        if (wallet.balanceWon !== null) wallet.spend(QUIZ_SNACK_COST_WON)
        setPose('eating')
        showBubble('냠냠, 간식 진짜 맛있어요! 🍕')
        const t2 = setTimeout(() => setPose('idle'), 2600)
        outingTimeoutsRef.current.push(t2)
      }, 1400)
      outingTimeoutsRef.current.push(t1)
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <div className="flex items-center gap-2">
          <img src="/assets/logo.png" alt="누리AI 로고" width={28} height={28} className="h-7 w-7 rounded-lg object-contain" />
          <h1 className="text-xl font-bold text-amber-900">AI 키우기</h1>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-8 text-center">
          <p className="text-sm text-amber-700/80">로그인하면 누리·두리를 키울 수 있어요.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            로그인
          </button>
        </div>
      </div>
    )
  }

  const hasNuri = characters.some((c) => c.companionType === 'nuri')
  const hasDuri = characters.some((c) => c.companionType === 'duri')

  // PR #49 요청 3: 턴 연출 대상 액션(teach/study/quiz)이면 짧게 "진행
  // 중" 화면을 보여준 뒤 패널을 연다. 나머지(chat-log/growth/album)는
  // 즉시 연다 — 기록을 보는 것뿐이라 턴 느낌이 어울리지 않는다. 동작
  // 줄이기 설정에서는 전환 없이 즉시 연다.
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // PR #51(직업 선택 제한 해제): 지금 고른 직업이 회계사·가수일 때만
  // "문제 풀기"를 쓸 수 있다 — GameMenu가 이미 버튼을 막아주지만, 혹시
  // 모를 경우를 대비해 여기서도 한 번 더 막는다(방어적 가드).
  const examSupported = character?.profession ? EXAM_SUPPORTED_PROFESSIONS.has(character.profession) : false
  const handleMenuSelect = (action: GameMenuAction) => {
    // 지시서(서점 외출 미션, 알바/경제 활동 이벤트): 외출·알바 중(집에
    // 없음)에는 어떤 메뉴도 새로 열지 않는다 — 다녀오는 동안 가르치기
    // 등을 열면 연출과 화면이 서로 겹친다.
    if (bookstoreOuting || workingOnJob) return
    // PR #50: 커스터마이징 룸/아이템 마켓은 직업 선택과 무관하게 항상
    // 열 수 있다(GameMenu의 alwaysEnabled와 동일한 예외). 지시서(누리AI
    // 만능마켓): 같은 이유로 만능마켓도 예외에 추가한다.
    if (!character?.profession && action !== 'customize' && action !== 'market' && action !== 'universalMarket') return
    if (action === 'quiz' && !examSupported) return
    const label = TURN_TRANSITION_LABEL[action]
    if (!label || reduceMotion) {
      setOpenSheet(action)
      return
    }
    setTurnTransition(action)
    if (turnTransitionTimeoutRef.current) clearTimeout(turnTransitionTimeoutRef.current)
    turnTransitionTimeoutRef.current = setTimeout(() => {
      setTurnTransition(null)
      setOpenSheet(action)
    }, 450)
  }

  const statGauges = character
    ? computeStatGauges({
        level: character.level,
        knowledgeTotal: knowledgeStats.total,
        aiGeneratedTotal: knowledgeStats.aiGenerated,
        messageTotal,
        examPassed,
        profession: character.profession,
      })
    : null
  const tier = character ? appearanceTierForLevel(character.level) : 'rookie'
  // PR #52: 6단계 연령대 — PR #63부터는 character.level에서 다시 계산하지
  // 않고 서버가 내려준 값을 그대로 쓴다(6미션 게이트로 고정된 상태를
  // 레벨만으로 무시해버리지 않도록 — GrowthContext.tsx의 Character.ageTier
  // 참고).
  const ageTier = character?.ageTier ?? 'toddler'
  // PR #52 후속 5차 요청 3번: 티어보다 더 구체적인 "지금 몇 살인지" 숫자
  // 뱃지용 — 역시 character.level에서 그때그때 계산하는 표시용 값이다.
  const ageNumber = character ? ageNumberForLevel(character.level) : 8
  const tendencyLabel = statGauges ? dominantStatLabel(statGauges) : '균형형'

  return (
    <div
      data-testid="grow-page-container"
      // PR #55 긴급 패치: PR #54의 lg:max-w-6xl(1152px)도 여전히 "박스에
      // 갇혀 있다"는 피드백을 받았다 — 더 넓은 캡이 아니라 캡 자체를
      // 완전히 없앤다. 다른 페이지들(HomePage 등, PR #53)이 이미 쓰는
      // lg:max-w-none 패턴과 동일하게 맞춰서, <main>(App.tsx, 자체
      // max-width 없음)이 주는 가로폭을 그대로 다 쓴다. lg부터는 둥근
      // 모서리도 없애 페이지 가장자리까지 꽉 찬 느낌을 유지한다.
      className="mx-auto flex max-w-xl flex-col gap-3 rounded-3xl bg-gradient-to-b from-amber-50 to-orange-50/60 px-3 py-4 sm:px-4 lg:max-w-none lg:rounded-none xl:px-10"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/assets/logo.png" alt="누리AI 로고" width={24} height={24} className="h-6 w-6 rounded-lg object-contain" />
          <h1 className="text-lg font-bold text-amber-900">AI 키우기</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 지시서("누리AI 키우기 간단 설명서"): 게임 규칙·직업 변경·
              미션 진행 방법을 바로 확인할 수 있는 도움말 버튼 —
              캐릭터 유무와 무관하게 항상 보인다. */}
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            data-testid="grow-guide-button"
            aria-label="누리AI 키우기 간단 설명서"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-amber-300 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-700 shadow-[0_2px_0_rgba(146,64,14,0.3)] transition hover:scale-[1.06] hover:border-amber-400 active:scale-95"
          >
            <BookOpen size={16} />
          </button>
          {characters.length > 0 && (
            <div className="flex gap-1 rounded-full bg-amber-100 p-1">
              {characters.map((c) => (
                <button
                  key={c.companionType}
                  onClick={() => selectCompanion(c.companionType)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected === c.companionType ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500/70'
                  }`}
                >
                  {COMPANION_LABEL[c.companionType]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showGuide && <GrowGuideSheet onClose={() => setShowGuide(false)} />}

      {/* PR #01(직업 변경 버튼 전면 이동): 기존엔 화면 맨 아래 작은
          텍스트 링크였다 — 언제든 눈에 띄고 누르기 쉽도록 화면 맨
          위쪽 왼쪽(제목 바로 아래)에 독립된 게임 스타일 버튼으로
          옮겼다. onClick/disabled/문구는 그대로라 기존 e2e의
          getByRole('button', { name: '직업 변경' }) 셀렉터는 위치와
          무관하게 계속 통과한다. */}
      {!loading && character && (
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => setShowProfessionPicker(true)}
            disabled={savingProfession}
            data-testid="profession-change-button"
            className="flex items-center gap-1.5 self-start rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-yellow-500 px-4 py-2 text-sm font-bold text-amber-950 shadow-[0_3px_0_rgba(146,64,14,0.5),0_0_10px_rgba(251,191,36,0.35)] transition hover:scale-[1.04] hover:border-amber-200 hover:from-amber-300 hover:to-yellow-400 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            <Briefcase size={16} />
            {character.profession ? '직업 변경' : '직업 선택'}
          </button>
          {!character.profession && (
            <p className="text-xs text-amber-600/70">직업을 선택하면 게임 메뉴를 쓸 수 있어요.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && character && (
        <div className="flex flex-col gap-2">
          <ResourceBar
            points={character.exp}
            energyRemaining={usage.teachRemaining + usage.studyRemaining}
            energyTotal={usage.teachLimit + usage.studyLimit}
            tendencyLabel={tendencyLabel}
          />

          {/* Stage 1(오프닝 프로필): 체험판 전용 가상 용돈 — 실제 DB에
              저장되지 않는다(useMockWallet.ts). 아직 지급받지 않았으면
              (온보딩을 거치지 않은 기존 캐릭터) 보여주지 않는다. */}
          {wallet.balanceWon !== null && (
            <div
              data-testid="mock-wallet-balance"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              <span>💰 가상 용돈 {wallet.balanceWon.toLocaleString('ko-KR')}원</span>
              <span className="text-[10px] font-normal text-amber-400">(체험판)</span>
            </div>
          )}

          {/* PR #49: 스테이지+HUD+스탯+퀘스트+메뉴를 하나의 목재
              프레임으로 묶었다 — 더 이상 흰 카드들이 줄줄이 쌓인
              목록이 아니라, 하나의 게임 화면이다.
              PR #54 요청 3번: PC(lg+)에서는 메뉴를 하단이 아니라 옆면
              (오른쪽) 사이드 패널로 옮긴다 — flex-col(모바일, 위아래로
              쌓임)에서 lg:flex-row(옆으로 나란히)로만 바꾸면 DOM 순서가
              그대로 "스테이지 먼저(위/왼쪽) → 메뉴 다음(아래/오른쪽)"을
              유지해, 모바일 레이아웃은 전혀 안 건드리고 PC에서만 메뉴가
              옆으로 옮겨간다.
              PR #55 긴급 패치: "카드 형태를 없애라"는 피드백에 따라
              lg부터는 이 목재 프레임 자체의 둥근 모서리·그림자를 없애서
              — 위 grow-page-container가 이미 가장자리까지 꽉 찬
              상태이므로 — 이 블록이 카드처럼 "떠 있는" 느낌 없이 화면에
              그대로 박혀 있는 듯 보이게 한다. lg:items-stretch로 바꿔
              오른쪽 사이드 패널의 테두리선이 왼쪽 스테이지 높이만큼
              끝까지 이어지게 했다(기존 items-start는 메뉴가 짧으면
              구분선이 중간에서 끊겨 보였다). */}
          <div className="overflow-hidden rounded-3xl bg-amber-950 shadow-lg lg:rounded-none lg:shadow-none">
            <div className="flex flex-col lg:flex-row lg:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                  <GameStage
                    companionType={character.companionType}
                    profession={character.profession}
                    pose={pose}
                    bubbleText={bubbleText}
                    onTapCharacter={() => {
                      // 지시서(캐릭터 인사말 말풍선): 인사말이 떠 있는 동안
                      // 캐릭터를 탭하면(= 화면 클릭) 기존 탭 반응으로
                      // 덮어쓰지 않고 그냥 닫는다.
                      if (dismissibleGreetingRef.current) {
                        dismissibleGreetingRef.current = false
                        if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current)
                        setBubbleText(null)
                        return
                      }
                      showBubble(character.profession ? '안녕하세요!' : '직업을 골라주세요!')
                    }}
                    onPropClick={handlePropClick}
                    tier={tier}
                    ageTier={ageTier}
                    ageNumber={ageNumber}
                    outfitId={inventory.equippedOutfit[character.companionType]}
                    // PR #50 긴급 재작업: 'lobby'도 이제 BACKGROUND_SCENES에서
                    // growthScenes.ts의 실제 일러스트 장면을 그대로 가리키므로
                    // (sceneForProfession의 기본값과 동일), 더 이상 특별 취급이
                    // 필요 없다 — 항상 inventory가 장착한 배경을 그대로 쓴다.
                    backgroundOverride={BACKGROUND_SCENES[inventory.equippedBackground]}
                  />
                  {xpPopup !== null && (
                    <span className="motion-safe:animate-[grow-xp-pop_1.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-xl font-extrabold text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.8)] sm:text-2xl">
                      +{xpPopup} XP
                    </span>
                  )}
                  {pointsPopup !== null && (
                    <span
                      data-testid="points-popup"
                      className="motion-safe:animate-[grow-xp-pop_1.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-xl font-extrabold text-emerald-300 drop-shadow-[0_0_10px_rgba(110,231,183,0.8)] sm:text-2xl"
                    >
                      +{pointsPopup}P 적립!
                    </span>
                  )}
                  {moneyPopup !== null && (
                    <span
                      data-testid="money-popup"
                      className="motion-safe:animate-[grow-xp-pop_1.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-xl font-extrabold text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.8)] sm:text-2xl"
                    >
                      +{moneyPopup.toLocaleString('ko-KR')}원 💰
                    </span>
                  )}
                  {leveledUpTo !== null && (
                    <span
                      data-testid="level-up-banner"
                      className="motion-safe:animate-[grow-levelup-pop_2.2s_ease-out_forwards] pointer-events-none absolute left-1/2 top-1/2 whitespace-nowrap text-3xl font-extrabold text-amber-300 drop-shadow-[0_0_20px_rgba(252,211,77,0.9)] sm:text-4xl">
                      🎉 Lv.{leveledUpTo} 레벨업!
                    </span>
                  )}
                  {evolvedTo !== null && (
                    <span
                      data-testid="evolution-banner"
                      className="motion-safe:animate-[grow-levelup-pop_2.8s_ease-out_forwards] pointer-events-none absolute left-1/2 top-[42%] whitespace-nowrap text-2xl font-extrabold text-cyan-200 drop-shadow-[0_0_24px_rgba(103,232,249,0.9)] sm:text-5xl"
                    >
                      ✨ {AGE_TIER_STAGE_LABEL[evolvedTo]} 단계로 진화했어요!
                    </span>
                  )}
                  {turnTransition && <TurnTransition label={TURN_TRANSITION_LABEL[turnTransition] ?? ''} />}
                  {workingOnJob && <TurnTransition label="아르바이트하는 중..." />}
                  {bookstoreOuting && (
                    <BookstoreOutingOverlay
                      stage={bookstoreOuting}
                      companionType={character.companionType}
                      storeName={BOOKSTORE_NAME}
                      onLeaveReview={handleBookstoreReviewSubmit}
                      ageTier={ageTier}
                      ageNumber={ageNumber}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-2 bg-gradient-to-b from-amber-900 to-amber-950 p-3">
                  <GrowthHUD
                    name={COMPANION_LABEL[character.companionType]}
                    stage={character.stage}
                    profession={character.profession}
                    customProfessionLabel={character.customProfessionLabel}
                    exp={character.exp}
                    recentLine={recentLine}
                    ageStageLabel={AGE_TIER_STAGE_LABEL[ageTier]}
                  />
                  {statGauges && <StatGaugesPanel values={statGauges} />}
                  {/* PR #65: 집중력 게이지 — 교육·장비 단계에 따른 전체
                      반영은 PR #66에서 이어가고, 지금은 저장 성공/검증
                      실패에 따라 소폭 오르내리는 값을 보여주기만 한다. */}
                  <div className="flex items-center gap-1.5" data-testid="focus-gauge">
                    <span className="w-7 shrink-0 text-[10px] font-semibold text-amber-100">집중력</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-50/15">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-[width] duration-500"
                        style={{ width: `${character.focusPercent}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-[10px] text-amber-200/70">{character.focusPercent}%</span>
                  </div>
                  <QuestBanner text={quest.text} action={quest.action} onAction={handleMenuSelect} />
                </div>
              </div>

              <div className="border-t border-amber-900/40 p-2 pt-2 lg:w-60 lg:shrink-0 lg:border-l lg:border-t-0 lg:p-3">
                <GameMenu disabled={!character.profession} examSupported={examSupported} onSelect={handleMenuSelect} />
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (!hasNuri || !hasDuri) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5">
          <p className="text-sm font-semibold text-amber-900">새 캐릭터 만들기</p>
          <div className="flex gap-3">
            {!hasNuri && (
              <button
                onClick={() => setOnboardingFor('nuri')}
                disabled={onboardingFor !== null}
                className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                누리 만들기 (여)
              </button>
            )}
            {!hasDuri && (
              <button
                onClick={() => setOnboardingFor('duri')}
                disabled={onboardingFor !== null}
                className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                두리 만들기 (남)
              </button>
            )}
          </div>
        </div>
      )}

      {showProfessionPicker && character && (
        <ProfessionPicker
          currentProfession={character.profession}
          currentCustomLabel={character.customProfessionLabel}
          onClose={() => setShowProfessionPicker(false)}
          onSelect={(id, customLabel) => {
            setShowProfessionPicker(false)
            if (character.profession === null) {
              void applyProfession(id, customLabel)
            } else {
              setPendingChange({ profession: id, customLabel })
            }
          }}
        />
      )}

      {pendingChange && character && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-amber-50 p-5 shadow-xl">
            <h2 className="text-base font-bold text-amber-900">직업을 변경할까요?</h2>
            <p className="mt-1.5 text-sm text-amber-700/80">
              {COMPANION_LABEL[character.companionType]}의 직업을{' '}
              <span className="font-semibold text-amber-900">
                {pendingChange.profession === 'custom' ? pendingChange.customLabel : PROFESSION_LABEL[pendingChange.profession]}
              </span>
              로 변경해요. 캐릭터 자체는 삭제되지 않아요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingChange(null)}
                disabled={savingProfession}
                className="rounded-full px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void applyProfession(pendingChange.profession, pendingChange.customLabel)}
                disabled={savingProfession}
                className="rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50"
              >
                {savingProfession ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openSheet && character && (character.profession || openSheet === 'customize' || openSheet === 'market' || openSheet === 'universalMarket') && (
        <BottomSheet
          title={SHEET_TITLE[openSheet]}
          onClose={() => setOpenSheet(null)}
          variant={openSheet === 'teach' || openSheet === 'study' ? 'mission' : 'default'}
        >
          {(openSheet === 'teach' || openSheet === 'study') && character.profession && (
            <InteractionPanel
              character={character}
              profession={character.profession}
              onPoseChange={handlePoseChange}
              onKnowledgeSaved={handleKnowledgeSaved}
            />
          )}
          {openSheet === 'quiz' && character.profession && (
            <ExamPanel
              character={character}
              profession={character.profession}
              onPoseChange={handlePoseChange}
              onCorrectAnswer={handleQuizAnswerCorrect}
            />
          )}
          {openSheet === 'chat-log' && <ChatLogPanel character={character} />}
          {openSheet === 'growth' && <RecordsPanel character={character} variant="growth" />}
          {openSheet === 'album' && <RecordsPanel character={character} variant="album" />}
          {openSheet === 'customize' && (
            <CustomizationRoom
              companionType={character.companionType}
              tier={tier}
              ageTier={ageTier}
              ageNumber={ageNumber}
              inventory={inventory}
              onOpenMarket={() => setOpenSheet('market')}
            />
          )}
          {openSheet === 'market' && <ItemMarket companionType={character.companionType} inventory={inventory} />}
          {openSheet === 'universalMarket' && <UniversalMarket wallet={wallet} />}
        </BottomSheet>
      )}

      {onboardingFor && (
        <OpeningProfileScreen
          companionType={onboardingFor}
          submitting={onboardingSubmitting}
          onCancel={() => setOnboardingFor(null)}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  )
}
