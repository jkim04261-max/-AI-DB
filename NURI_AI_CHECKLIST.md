# 누리AI 개발 단계별 검수 체크리스트

지시서(14번: 개발·배포·운영 및 이용 고지)에 따라 작성된 운영 체크리스트입니다.
이 문서는 "다 됐다"는 선언이 아니라, **지금 시점에 실제로 코드에서 확인한 것만** 적습니다 —
완료로 표시된 항목은 근거 파일을 함께 적어, 나중에 재검증할 수 있게 합니다.

마지막 갱신: 2026-11-19 (13번 항목까지 반영)

---

## A. 운영 안정화 및 배포 파이프라인

| 항목 | 상태 | 근거 / 비고 |
| --- | --- | --- |
| 기술 스택 유지(React/Vite/Vercel + Neon 기반 `@vercel/postgres`) | ✅ 완료 | `package.json` — 스택 변경 없음 |
| 스키마 변경 시 기존 데이터 보존(마이그레이션) | ✅ 완료(정책으로 확립) | `api/_lib/db.ts`의 모든 `ensure*Table()`은 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`만 쓰고, `DROP`/파괴적 변경은 한 곳도 없음(직접 확인). **앞으로도 이 저장소의 모든 스키마 변경은 이 패턴만 쓴다** — 컬럼을 지우거나 타입을 바꾸는 마이그레이션은 기존 데이터를 보존하는 별도 단계(새 컬럼 추가 → 백필 → 이전 컬럼은 당분간 유지) 없이는 하지 않는다. |
| 서버 권한 검사 | ✅ 완료(기존 패턴) | 모든 API 핸들러가 `getSessionUser`로 로그인 여부를 먼저 확인하고, 소유권은 `findOwnCharacter`/`WHERE id = ... AND user_id = ...` 패턴으로 쿼리 자체에 건다(`api/character.ts`, `api/conversations/[id].ts` 등). 관리자 전용 엔드포인트는 이메일 화이트리스트로 별도 검사(`api/admin/*.ts`). 12번 항목에서 교차 유저 접근 테스트로 이미 검증됨(`tests/character.test.cjs`, `tests/knowledgeLog.test.cjs`, `tests/adminAccess.test.cjs`). |
| 자동 테스트(Unit) | ✅ 완료 | `tests/*.test.cjs`(현재 10개 파일, 수백 건) — `npm test`로 실행, CI(`checks` job)에서 PR마다 자동 실행 |
| 자동 테스트(E2E) | ✅ 완료 | `e2e/*.spec.ts`(현재 14개 파일) — `npm run test:e2e`로 실행, CI(`e2e` job)에서 PR마다 자동 실행(`.github/workflows/ci.yml`) |
| **PR/Preview 검증 전 Main 직접 병합 금지(강제)** | ⚠️ **운영자 조치 필요** | 아래 "Main 브랜치 보호 설정" 참고 — 이 리포지토리를 체크아웃한 세션에는 GitHub 저장소 설정(Branch protection)을 바꿀 권한/도구가 없어서, **코드로는 강제할 수 없고 반드시 저장소 Settings에서 사람이 켜야 하는 항목**입니다. |
| 정기 백업 | ⚠️ **운영자 확인 필요** | Vercel Postgres(Neon 기반)는 플랜에 따라 자동 PITR(시점 복구)을 제공합니다. 이 세션은 Vercel/Neon 대시보드에 접근할 수 없어 **현재 보관 기간이 실제로 몇 일로 설정돼 있는지 확인할 수 없습니다** — 운영 전 Vercel 프로젝트의 Storage(Postgres) 설정에서 백업/PITR 보관 기간을 직접 확인하고, 필요하면 유료 플랜으로 늘려야 합니다. |

### Main 브랜치 보호 설정 (운영자가 GitHub에서 직접 켜야 하는 항목)

이 저장소에 연결된 도구로는 GitHub의 "Branch protection rule" 자체를 만들거나 조회할 수 없습니다(저장소
Settings 권한이 필요한 영역). 아래를 **저장소 Settings → Branches → Branch protection rules → `main`**에서
직접 켜주세요:

1. **Require a pull request before merging** — `main`에 직접 push를 막고, 반드시 PR을 통해서만 병합되게 합니다.
2. **Require status checks to pass before merging** — 이 저장소의 CI(`.github/workflows/ci.yml`의 `checks`, `e2e` job)를 필수 체크로 지정합니다.
3. **Require branches to be up to date before merging** — PR이 최신 `main` 기준으로 검증되게 합니다.
4. (권장) **Do not allow bypassing the above settings** — 저장소 관리자(Owner)도 예외 없이 같은 규칙을 따르게 합니다.

이 설정이 켜지기 전까지는, CI가 `push: branches: [main]`에도 걸려 있어 **직접 병합된 변경도 사후에 checks가
실패하면 바로 드러나지만**(이미 구성됨), 병합 자체를 막지는 못합니다 — 즉 지금은 "사후 탐지"만 되고
"사전 차단"은 운영자가 위 설정을 켜야만 완성됩니다.

---

## B. 이용약관 및 개인정보 처리방침 고지

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 이용약관 페이지(`/terms`) | ✅ 이미 존재 | `src/pages/TermsPage.tsx`, `src/App.tsx`에 라우트 등록됨 |
| 개인정보처리방침 페이지(`/privacy`) | ✅ 이미 존재 + 이번에 보강 | `src/pages/PrivacyPage.tsx` — 저장 항목에 "지식 기록장(업무·연구 기록)" 데이터와 그 공개 범위(비공개/부분공개/전체공개)를 새로 추가, 캐릭터 이름·생일·거주지역은 **저장되지 않는다**는 점을 명시, 처리 목적에 "지식 자산화"를 명시, 이용자 권리에 공개 범위 변경권과 내보내기(Export) 미제공 사실을 추가 |
| 가입 시 동의 절차 | ✅ 완료(12번 항목에서 구현) | `src/pages/SignupPage.tsx` + `api/auth/signup.ts` — 두 체크박스(이용약관/개인정보처리방침) 모두 체크해야 가입 버튼이 활성화되고, 서버도 `agreedTerms`/`agreedPrivacy`를 다시 검증(`e2e/login.spec.ts`, `tests/core-regression.test.cjs`) |
| AI 처리 고지 | ✅ 완료 | `PrivacyPage.tsx` 6번 — 실제로 쓰는 **Google Gemini API**를 정확히 명시(지시서 예시 문구의 "딥시크"는 이 서비스가 실제로 쓰는 AI가 아니라 반영하지 않음 — 틀린 사실을 약관에 넣지 않기 위한 선택) |
| 공개 범위(비공개/부분공개/전체공개) 고지 | ✅ 완료 | `PrivacyPage.tsx` 1번/7번 — 지식 기록장(11번 항목)의 visibility 값을 그대로 설명 |
| 관리자 접근 제한 고지 | ✅ 완료(12번 항목에서 구현) | `PrivacyPage.tsx` 10~11번 — 관리자도 개인 학습/기록 데이터를 열람할 수 없고, 접근 시 감사 로그가 남는다는 내용 |

---

## C. 1~4차 개발 단계별 검수 기준

> 상태 표기: ✅ 완료 / 🟡 부분 완료(남은 범위 명시) / ⬜ 미착수

### 1차 — 기존 성장/문제은행/보상/시험/저장 기능 감사 및 8~60세 성장 엔진 완성
- ✅ 8~60세 10단계 연령 전환(`src/data/characterAge.ts`, `api/_lib/characterMissions.ts`)
- ✅ 경험치/레벨/보상 체계(`api/_lib/characterGrowth.ts`)
- ✅ 지식 저장·검증(Gemini) 및 대화 기록 저장(`api/character.ts`)
- ✅ 단계별 시험·합격·재도전(9번 항목, `character_stage_exam_history`)
- 🟡 직업별 시험 문제은행 — 현재 50개 직업 중 **2개(회계사·가수)만** 실제 문제은행이 있고, 나머지 48개는
  "문제 풀기" 버튼이 비활성화되며 "준비 중"으로 표시됨(`src/data/characterProfessions.ts`의
  `EXAM_SUPPORTED_PROFESSIONS`, `e2e/grow-game-ui.spec.ts`가 이 상태를 "솔직하게" 보여주는지까지 검증).
  나머지 48개 직업의 문제은행 제작은 별도 과제로 남아 있음.

### 2차 — 프로필/직업 기록/사진·동영상 첨부/개인 마스터 보안 구조 완성
- ✅ 직업 선택·변경(확인 모달 포함) 및 저장(`api/character.ts`의 `setProfession`)
- ℹ️ 캐릭터 이름/생일/거주지역 입력값은 **의도적으로 저장하지 않음**(그 화면에서만 잠깐 쓰고 버림 —
  `src/pages/GrowPage.tsx`의 `handleOnboardingComplete` 주석 참고). 저장이 빠진 게 아니라 설계 결정이며,
  위 B절 개인정보처리방침에도 그대로 고지함.
- ✅ 사진·동영상 첨부(지식 기록장, 11번 항목) — 용량 제한/악성 파일 차단/저작권 경고 포함
- ✅ 개인 마스터 DB 보안 구조(12번 항목) — user_id 격리, 관리자 비열람, 암호화 유틸, 감사 로그, 약관 동의

### 3차 — 2.5D 원본 에셋 적용/지역 건물 생성/캐릭터 걷기·입장 구현
- ⬜ **미착수.** 현재 AI 키우기 화면(`src/pages/GrowPage.tsx`)은 정지된 단일 배경 일러스트(기본 "마법진
  도서관") 위에 캐릭터가 서 있는 구조이고, 구매한 장소는 CSS 그라디언트 방으로 표시됨
  (`src/data/growthScenes.ts`, `src/data/backgroundCatalog.ts`). 2.5D 레이어링된 지역 지도, 건물을 직접
  생성/배치하는 기능, 캐릭터가 맵을 걸어서 건물에 들어가는 이동 기능은 코드 어디에도 없음. 이 항목은
  규모가 크고(새 지도 데이터 구조, 이동 로직, 에셋 제작 필요) 지시서 14번이 요구한 "완료 후 검증"
  범위(이용약관·배포 프로세스·체크리스트 문서화)에도 포함돼 있지 않아, 이번 작업에서는 구현하지 않고
  **다음 기능 제안으로 남깁니다.**

### 4차 — 보조 미니게임 확대/마스터 시상/공개 권한 설정
- 🟡 보조 미니게임 — 현재 2개(가르치기/스스로 공부하기 커리큘럼에 내장된 `CardMatchGame`, 알바
  이벤트의 `JobQuiz`). "확대"라고 할 만큼 여러 개는 아니고, 새 미니게임 추가는 별도 과제로 남아 있음.
- 🟡 마스터 시상 — Lv.40+ 캐릭터에게 "장인증서" 리본 배지가 표시됨(`src/components/grow/CharacterSprite.tsx`)
  — 뱃지 형태의 시각적 인정은 있지만, 별도의 시상식 화면이나 알림은 없음.
- ✅ 공개 권한 설정 — 지식 기록장(11번)과 지식 마켓(13번, 후속 개발 placeholder)의 visibility
  (비공개/부분공개/전체공개) 필드로 구현됨.

---

## 완료 후 검증(이번 항목)
- [x] 이용약관(`/terms`)·개인정보처리방침(`/privacy`) 페이지가 정상 노출됨 — 기존 라우트 그대로 재사용.
- [x] 가입 시 두 약관에 모두 동의해야만 가입되는 절차가 (이미) 작동함 — `e2e/login.spec.ts`.
- [x] 1~4차 검수 체크리스트가 문서화됨(이 문서).
- [ ] "PR/Preview 검증 없이 Main에 병합되지 않는다"는 위 A절 설명대로 **아직 운영자가 GitHub 저장소
  설정에서 Branch protection을 켜야 완성됩니다** — 코드/CI만으로는 기술적으로 강제할 수 없는 영역이라,
  이 문서에 그 사실과 켜야 할 정확한 설정을 남겨 두었습니다.
