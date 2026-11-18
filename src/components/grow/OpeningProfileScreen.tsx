import { useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import fantasyLibraryBgImg from '../../assets/grow/fantasy-library-bg.webp'
import { GROW_INITIAL_ALLOWANCE_WON } from '../../hooks/useMockWallet'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }
const COMPANION_DEFAULT_NAME: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }

// 지시서(프로필 작성 폼 확장: 직업 이력 및 근무지 상세 등록 기능 추가):
// 공개 범위 — 기본값은 '비공개'다(사용자 확인 없이 상호명이 노출되지
// 않도록 보수적으로 잡는다).
export type JobHistoryVisibility = 'public' | 'private'

export interface OpeningProfile {
  name: string
  birthday: string
  region: string
  profession: string
  // 직업 이력(상호명/업종/경력 시작일/공개 범위) — 전부 선택 입력이고,
  // 비워두면 빈 문자열로 넘어간다. 실제 저장 여부·방식은 이 화면이
  // 아니라 호출부(GrowPage)가 결정한다(기존 birthday/region과 같은
  // 원칙).
  workplaceName: string
  industry: string
  careerStartMonth: string
  jobHistoryVisibility: JobHistoryVisibility
}

// Stage 1(오프닝 프로필): 신규 캐릭터를 처음 만들 때 보여주는 몰입형
// 시작 화면 — 이름/생일/일하는 지역/직업과(지시서: 프로필 작성 폼
// 확장) 직업 이력(상호명/업종/경력 시작일/공개 범위)을 입력받는다.
// 캐릭터 이름을 제외한 나머지는 전부 선택 입력이고, 비워두면 건너뛸
// 수 있다(직업은 나중에 기존 "직업 선택"에서 골라도 된다).
//
// 이 화면 자체는 어떤 값도 저장하지 않는다 — onComplete로 입력값만
// 그대로 올려보내고, 실제로 무엇을 할지(캐릭터 생성·직업 저장 API
// 호출, 직업 이력의 로컬 저장 여부)는 호출부(GrowPage)가 결정한다.
//
// PR #97에서 추가했던 "성별(선택)" 필드는 제거했다 — 어느 캐릭터
// (누리/두리)를 키울지는 이 화면이 열리기 전에 이미 정해져 있는데
// (호출부가 넘겨주는 companionType), 여기서 또 성별을 고르게 하는
// 입력이 "내가 고른 성별대로 캐릭터가 정해진다"는 오해를 계속
// 일으켰다(실제 신고 사례: 버튼으로 이미 만든 캐릭터와 다른 성별을
// 폼에서 고르고 "잘못 나왔다"고 보고). 플레이버 전용이라는 걸 아무리
// 명확히 문서화해도 화면상으로는 구분이 안 가 반복됐으므로, 필드
// 자체를 없애 혼란의 소지를 제거했다.
export default function OpeningProfileScreen({
  companionType,
  onComplete,
  onCancel,
  submitting,
}: {
  companionType: CompanionType
  onComplete: (profile: OpeningProfile) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [name, setName] = useState(COMPANION_DEFAULT_NAME[companionType])
  const [birthday, setBirthday] = useState('')
  const [region, setRegion] = useState('')
  const [profession, setProfession] = useState('')
  const [workplaceName, setWorkplaceName] = useState('')
  const [industry, setIndustry] = useState('')
  const [careerStartMonth, setCareerStartMonth] = useState('')
  const [jobHistoryVisibility, setJobHistoryVisibility] = useState<JobHistoryVisibility>('private')

  const canStart = name.trim().length > 0 && !submitting

  return (
    <div
      data-testid="opening-profile-screen"
      role="dialog"
      aria-modal="true"
      aria-label="오프닝 프로필 설정"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950 px-4 py-6"
    >
      <div className="absolute inset-0">
        <img src={fantasyLibraryBgImg} alt="" className="h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/85" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-3xl border-2 border-cyan-400/40 bg-slate-900/90 p-5 shadow-[0_8px_40px_rgba(56,189,248,0.25)] backdrop-blur-xl">
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-2xl">✨</p>
          <h1 className="text-lg font-bold text-cyan-100">{COMPANION_LABEL[companionType]}와 함께하는 첫걸음</h1>
          <p className="text-xs text-cyan-200/70">
            {COMPANION_LABEL[companionType]}에게 이름과 간단한 프로필을 알려주세요. 생일·거주지역·직업은 비워두고 나중에 채워도 괜찮아요.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">이름(가명 가능):</span>
          <input
            data-testid="opening-profile-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={COMPANION_DEFAULT_NAME[companionType]}
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">생일:</span>
          <input
            data-testid="opening-profile-birthday-input"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">일하는 지역:</span>
          <input
            data-testid="opening-profile-region-input"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            maxLength={30}
            placeholder="예: 경기도 일산 정발산동"
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">직업:</span>
          <input
            data-testid="opening-profile-profession-input"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            maxLength={30}
            placeholder="예: 변호사"
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        {/* 지시서(프로필 작성 폼 확장: 직업 이력 및 근무지 상세 등록
            기능 추가): 상호명/업종/경력 시작일/공개 범위 — 전부 선택
            입력이라 비워도 시작할 수 있다(canStart는 이름만 본다). */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">직장/상호명:</span>
          <input
            data-testid="opening-profile-workplace-name-input"
            value={workplaceName}
            onChange={(e) => setWorkplaceName(e.target.value)}
            maxLength={40}
            placeholder="예: 자양청년치킨, 강남병원, 프리랜서"
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">업종/직무 분야:</span>
          <input
            data-testid="opening-profile-industry-input"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            maxLength={30}
            placeholder="예: 요식업, 의료/간호, IT/개발"
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-cyan-200/80">경력 시작일:</span>
          <input
            data-testid="opening-profile-career-start-input"
            type="month"
            value={careerStartMonth}
            onChange={(e) => setCareerStartMonth(e.target.value)}
            className="rounded-xl border border-cyan-400/25 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5 rounded-xl border border-cyan-400/15 bg-slate-800/40 px-3 py-2">
          <span className="text-xs font-semibold text-cyan-200/80">내 근무지/상호 정보를 다른 유저에게 공개하시겠습니까?</span>
          <div className="flex gap-4 text-sm text-slate-100">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="job-history-visibility"
                data-testid="opening-profile-visibility-public"
                checked={jobHistoryVisibility === 'public'}
                onChange={() => setJobHistoryVisibility('public')}
              />
              공개
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="job-history-visibility"
                data-testid="opening-profile-visibility-private"
                checked={jobHistoryVisibility === 'private'}
                onChange={() => setJobHistoryVisibility('private')}
              />
              비공개
            </label>
          </div>
          <span className="text-[11px] text-cyan-200/50">기본값은 비공개예요. 공개로 선택해도 아직은 보여줄 마켓·지도 기능이 없어 실제로 노출되지는 않아요.</span>
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
          🎁 시작하면 가상 용돈 <span className="font-bold">{GROW_INITIAL_ALLOWANCE_WON.toLocaleString('ko-KR')}원</span>을 받아요 (체험판 — 새로고침하면 초기화돼요)
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="opening-profile-start-button"
            onClick={() =>
              onComplete({
                name: name.trim(),
                birthday,
                region,
                profession: profession.trim(),
                workplaceName: workplaceName.trim(),
                industry: industry.trim(),
                careerStartMonth,
                jobHistoryVisibility,
              })
            }
            disabled={!canStart}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_12px_rgba(56,189,248,0.4)] hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
          >
            {submitting ? '만드는 중...' : '나만의 AI 키우기 시작'}
          </button>
          <button
            type="button"
            data-testid="opening-profile-cancel-button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-cyan-200/60 hover:text-cyan-100 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
