# PR #45 진행 상황 — 2D 캐릭터 육성 게임 MVP

이 문서는 세션이 중단되더라도 마지막 완료 지점부터 이어서 작업할 수 있도록, 체크포인트별 완료/남은 작업/변경 파일/테스트 결과/재개 방법을 기록합니다.

## 현재 상태

- **브랜치**: `claude/pr45-2d-growth-game-mvp` (base: `origin/main` @ `9302071`, PR #44 포함)
- **완료된 체크포인트**: 1(분석·설계), 2(2D 게임 화면·캐릭터), 3(캐릭터 대화·학습 연동), 3.5(DB 저장 구조 점검 — 사용자 요청으로 체크포인트 4 전에 삽입)
- **다음 체크포인트**: 4(XP·레벨·퀴즈) — **사용자 추가 승인 대기 중**, 아직 시작하지 않음

## 체크포인트 3.5 — DB 저장 구조 점검 (완료, 체크포인트 4 전 사용자 요청으로 삽입)

사용자가 "누리AI의 가장 중요한 사업 전략"으로 모든 대화·지식·검증·시험·XP가 사용자별·캐릭터별로 Neon에 지속적으로 저장되어야 한다는 요구사항을 제시, 체크포인트 4 전에 현재 저장 구조를 점검하도록 요청받음.

- 코드베이스 전체(일반 채팅 저장, 게임 지식 저장, 계정 삭제 cascade, 관리자 엔드포인트, 개인정보 관련 페이지)를 읽기 전용으로 감사.
- 발견한 사실 오류를 즉시 수정(코드 아님, 법적 고지 문서): `PrivacyPage.tsx`·`AiNoticePage.tsx`가 "회원탈퇴 준비 중", "AI 키우기 미구현"이라고 잘못 명시하고 있었음(둘 다 이미 배포됨) — 실제 수집 항목(캐릭터/지식/출처/검증 결과), 비공유·비공용학습 방침, DB 기반 "기억"과 실제 모델 재학습의 구분을 명시하도록 현행화.
- 대화 피드(가르치기/스스로 공부하기 중 캐릭터의 대사) 영속화, 수정 필요/검증 불가 결과 보존, 개별 지식 삭제 기능 등은 DB 스키마에 영향을 주는 별도 설계 사안으로 식별 — CLAUDE.md 8번 규칙에 따라 코드 변경 없이 설계안만 사용자에게 제시하고 승인 대기 중(채팅 보고 참고).
- 변경 파일: `src/pages/PrivacyPage.tsx`, `src/pages/AiNoticePage.tsx`
- 테스트: `npm run build`/`lint` 통과, `npm test` 172/172, E2E 35/35(모두 기존 그대로 — 내용 수정만, 동작 변경 없음)

## 체크포인트 1 — 분석·설계

- 코드 변경 없음. 채팅 보고로 분석 결과·설계 방향·위험 요소를 보고하고 사용자 승인을 받음(승인 메시지: "PR #45 분석 보고서를 확인했습니다. 설계 방향을 승인합니다. 체크포인트 2(2D 게임 화면·캐릭터)부터 개발을 시작하세요.").
- 승인된 조건(요약): SVG+CSS 자체 제작 캐릭터, `/grow` 공부방 개편, 가르치기/스스로 공부하기 통합(체크포인트 3), 스스로 공부하기 하루 3회(체크포인트 3~4), 시험 3~5문항 직접 작성(체크포인트 4), XP(지식저장 +10/퀴즈정답 +5/시험합격 +50, 체크포인트 4), 기존 기능·DB·Vercel 12-함수 제한 보호, 체크포인트별 커밋+진행 기록.

## 체크포인트 2 — 2D 게임 화면·캐릭터 (완료)

### 구현 내용
- `src/components/grow/CharacterSprite.tsx`(신규): 누리(남)·두리(여) 전용 SVG 캐릭터. 포즈 4종(`idle`/`studying`/`happy`/`sad`) + 독립적인 눈 깜빡임 CSS 애니메이션. 포즈별로 입 모양(`MOUTH_PATH`)·눈썹 각도(`EYEBROW_TRANSFORM`)·팔 자세(`ARM_TRANSFORM`)가 바뀌고, `studying`일 때 작은 공책, `happy`일 때 반짝이는 별, `sad`일 때 눈물 한 방울이 추가로 나타납니다. 모든 도형은 원/둥근 사각형/path 조합의 자체 제작이며 프린세스 메이커 등 기존 게임의 이미지·캐릭터를 참조·복제하지 않았습니다.
- `src/index.css`: 캐릭터 애니메이션 전용 `@keyframes`(breathe/sway-study/bounce-happy/droop-sad/blink/twinkle) + `prefers-reduced-motion: reduce` 대응(애니메이션 끔) 추가. 새 패키지 설치 없이 순수 CSS로 구현(요청하신 "과도한 엔진·무거운 패키지 금지" 준수).
- `src/pages/GrowPage.tsx`: `CharacterCard`의 기존 새싹 아이콘 자리를 `CharacterSprite`로 교체하고, 카드 배경을 공부방 느낌의 연한 그라디언트 타일로 바꿨습니다. `Lv.1` 배지 + XP 바(현재는 0% 자리표시자 — 실제 레벨/XP 연동은 체크포인트 4)를 추가했습니다. `KnowledgeTeachPanel`(기존 PR #44 지식 검증 UI, 로직 변경 없음)이 `onPoseChange` 콜백을 받아 **기존 `verify-knowledge` 호출**에 맞춰 캐릭터 표정을 바꿉니다: 검증 중 `studying`, 적합 결과면 `happy`(2.5초 후 자동으로 `idle` 복귀), 수정 필요/검증 불가/오류면 `sad`(2.5초 후 복귀). 패널을 닫으면(언마운트) 타이머를 기다리지 않고 즉시 `idle`로 돌아갑니다.
- **백엔드(API/DB) 변경 없음** — 이번 체크포인트는 순수 프런트엔드 작업이며 기존 `api/character.ts`, `api/_lib/*`, DB 스키마를 전혀 건드리지 않았습니다.

### 기존 기능 보호 확인
- 캐릭터 생성(`누리 만들기 (남)`/`두리 만들기 (여)`), 직업 선택·변경(확인 모달 포함), 지식 가르치기(검증→저장, 서명 토큰 포함), 학습 기록 조회 — **모든 텍스트·버튼·동작을 한 글자도 바꾸지 않고 그대로 유지**했습니다. 시각적으로만 캐릭터 아이콘과 카드 배경이 바뀌었습니다.
- 로그인/회원가입, Gemini 대화, 이미지 첨부, 마이페이지 "내 AI" 섹션 — 전혀 건드리지 않음(해당 파일 미수정).

### 변경 파일
- 신규: `src/components/grow/CharacterSprite.tsx`
- 수정: `src/pages/GrowPage.tsx`, `src/index.css`, `e2e/character.spec.ts`(+1 assertion), `e2e/knowledge.spec.ts`(+포즈 전환 assertion 3곳)

### 테스트 결과
- `npm run typecheck:api`: 통과
- `npm run build`(프런트 typecheck + vite build): 통과
- `npm run lint`: 기존 경고 5건 + 신규 경고 1건(`CharacterSprite.tsx`의 `only-export-components` — 기존 3개 파일에도 동일한 종류의 경고가 이미 있던 패턴과 동일, 기능에는 영향 없음)
- `npm test`(API/유닛): 152/152 통과 (이번 체크포인트는 API를 건드리지 않아 전부 기존과 동일)
- `npm run test:e2e`: **33/33 통과** (기존 셀렉터 전부 유지 확인 + 신규 포즈 전환 assertion 4건 포함)
- Vercel 서버리스 함수 개수: `find api -name "*.ts" -not -path "*/_lib/*" | wc -l` → **12** (변경 없음)
- 수동 스크린샷 확인(데스크톱 1280px, 모바일 390px): 대기/공부/기쁨 포즈 모두 의도대로 렌더링, 모바일 가로 스크롤 없음

## 체크포인트 3 — 캐릭터 대화·학습 연동 (완료)

### 구현 내용

**백엔드 (신규 action 1개, 기존 action 3개 확장, DB 컬럼 1개 추가 — 함수 개수 그대로 12)**
- `api/_lib/db.ts`: `character_knowledge_entries`에 `source TEXT NOT NULL DEFAULT 'user_taught' CHECK (source IN ('user_taught','ai_generated'))` 컬럼 추가(`ADD COLUMN IF NOT EXISTS` — 기존 행은 전부 자동으로 `user_taught`로 채워짐, 데이터 손실 없음).
- `api/_lib/studyLimit.ts`(신규): "스스로 공부하기" 전용 하루 호출 한도. 승인하신 대로 **하루 3회**, `daily_teach_usage`(지식 검증 10회)·`daily_question_usage`(채팅 10회)와 완전히 분리된 테이블/카운터. `reserveTeach`/`refundTeach`와 동일한 원자적 "검사 후 증가" 패턴.
- `api/_lib/gemini.ts`: `generateSelfStudy(professionLabel, knownTitles)` 추가 — **Gemini 호출 1회**로 캐릭터가 새 지식을 생성하고 스스로 평가까지 끝낸다(생성+검증을 분리된 2회 호출로 하지 않음 — 조건 8의 비용 통제). 응답을 해석할 수 없으면(JSON 깨짐, title/content 누락·초과) `SelfStudyParseError`를 던져 호출로 처리하고 한도를 환불한다.
- `api/_lib/knowledgeToken.ts`: 서명 토큰에 `source` 필드 추가 — **이 지식이 user_taught인지 ai_generated인지도 서버 서명으로 보증**한다. `save-knowledge`는 이제 요청 본문의 어떤 필드도 아닌, 오직 토큰에 서명된 `source`만 신뢰해 DB에 쓴다(클라이언트가 `source`를 같이 보내도 서버는 아예 읽지 않음 — 테스트로 확인).
- `api/character.ts`: `?action=study-generate`(신규, POST) — 소유권·직업 확인 → 하루 3회 한도 예약(한도 초과면 Gemini 호출 전에 즉시 429, 비용 0) → 최근 가르친/배운 지식 제목 최대 20개를 Gemini에 참고자료로 전달(중복 생성 방지, 프롬프트 크기 제한) → 생성+자체검증 → PR #44와 동일한 서명 토큰 발급. **저장은 새 경로를 만들지 않고 기존 `save-knowledge`를 그대로 재사용** — `verify-knowledge`든 `study-generate`든 돌아온 토큰을 그대로 넘기면 끝.
- `handleSaveKnowledge`/`handleListKnowledge`의 SELECT/INSERT에 `source` 컬럼 추가.

**프런트엔드 (통합 상호작용 패널)**
- `src/components/grow/InteractionPanel.tsx`(신규, `GrowPage.tsx`에서 분리): 기존 "지식 가르치기" 패널을 대체하는 **하나의 패널**에 가르치기 작성창 + "OO 스스로 공부하기" 버튼 + 대화 피드(dialogue feed)를 전부 담았다 — 별도 화면·탭·모드 전환이 없다(조건 2). 두 액션 모두 같은 검증 결과 카드·저장 버튼·위조 방지 로직(토큰 불일치 시 저장 거부)을 공유한다(조건 3).
  - 가르치기: 사용자가 입력 → "Gemini 검증하기" → 결과를 받으면 캐릭터가 설명을 자신의 말로 풀어 대화 피드에 한 줄 남긴다(예: "정확해요! 복식부기는 회계의 기본 원리예요. 알려주셔서 고마워요!").
  - 스스로 공부하기: 버튼 하나로 캐릭터가 새 지식을 생성 → 입력창에 그 내용이 채워져 사용자가 저장 전에 검토할 수 있다(자동 저장 아님, PR #44 원칙 유지) → 대화 피드에 "오늘은 'OO'에 대해 혼자 공부해봤어요! ..." 식으로 스스로 설명(조건 4).
  - 저장하면 캐릭터가 "이 지식을 배웠어요! 다음엔 또 어떤 걸 가르쳐 주실 건가요?"(가르치기) / "...다음엔 또 무엇을 공부해볼까요?"(스스로 공부하기) 같은 후속 질문을 대화 피드에 남긴다 — 전부 Gemini가 실제로 만든 문장(explanation/suggestion)을 재료로 한 클라이언트 템플릿이라 **추가 Gemini 호출이 전혀 없다**.
  - 표정·동작·대사 연결(조건 5): 검증/생성 중엔 `studying` 포즈, 결과가 적합이면 `happy`, 아니면 `sad`로 바뀌면서 동시에 대화 피드에 해당 대사가 나타난다 — 이미 체크포인트 2에서 만든 `onPoseChange` 콜백을 그대로 재사용.
  - 학습 기록 목록에 "직접 가르침"/"스스로 학습" 출처 표시 추가.
- `src/context/GrowthContext.tsx`: `studyGenerate()` 메서드 추가, `KnowledgeEntry`/`KnowledgeVerification` 타입에 `source` 필드 추가.
- `CharacterSprite.tsx`는 **전혀 수정하지 않음** — 조건 7(임시 에셋, 교체 가능 구조 유지)이 자연스럽게 지켜짐.

### 기존 기능 보호 확인
- 로그인/회원가입, Gemini 대화, 이미지 첨부, 캐릭터 생성, 직업 선택·변경 — 해당 파일 전혀 수정하지 않음.
- 기존 지식 검증(verify-knowledge)·저장(save-knowledge)·목록(knowledge) action은 동작 100% 동일(요청/응답 모양 변경 없음, `source` 필드가 응답에 추가된 것뿐).
- PR #44의 서명 토큰 위조 방지 로직은 그대로 — 오히려 `source`까지 토큰에 포함시켜 보호 범위를 넓혔다.

### 변경 파일
- 신규: `api/_lib/studyLimit.ts`, `src/components/grow/InteractionPanel.tsx`
- 수정: `api/_lib/db.ts`, `api/_lib/gemini.ts`, `api/_lib/knowledgeToken.ts`, `api/character.ts`, `src/context/GrowthContext.tsx`, `src/pages/GrowPage.tsx`(패널 분리로 축소), `tests/knowledge.test.cjs`, `tests/mock-postgres-impl.cjs`, `e2e/knowledge.spec.ts`

### 테스트 결과
- `npm run typecheck:api` / `npm run build` / `npm run lint`: 통과(신규 경고 없음, 기존 6건과 동일 종류)
- `npm test`: **172/172 통과** (`knowledge.test.cjs`가 43 → 63건으로 확장 — study-generate 인증/직업 확인/정상 흐름/소스 위조 무시/중복 제출 방지/해석 실패 시 환불/하루 3회 한도 분리/다른 사용자 차단/목록에 source 표시까지 커버)
- `npm run test:e2e`: **35/35 통과** (기존 지식 검증 테스트 전부 셀렉터 그대로 통과 — 저장 확인 배너만 대화 피드 메시지로 바뀐 1곳 업데이트, 스스로 공부하기 2건·통합 상호작용 1건 신규)
- Vercel 함수 개수: **12 (변경 없음)** — `study-generate`는 새 파일이 아니라 `api/character.ts`의 action 하나 추가
- Gemini 호출 비용: 가르치기 1회=호출 1회(기존과 동일), 스스로 공부하기 1회=호출 1회(생성+검증 통합), 하루 상한 각각 10회/3회로 분리 적용
- 수동 스크린샷 확인: 가르치기 메시지 + 스스로 공부하기 메시지가 같은 대화 피드에 함께 쌓이는 것, 결과 카드·저장 버튼·두 가지 남은 횟수 표시가 한 화면에 자연스럽게 공존하는 것을 확인

## 재개 방법 (세션이 중단된 경우)

1. `git log --oneline -3` 로 마지막 커밋이 "PR #45 checkpoint 3" 커밋인지 확인
2. `npm ci`(node_modules 없으면) → `npm test` / `npm run build` / `npm run lint` / `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test` 로 현재 상태가 전부 통과하는지 재확인
3. 체크포인트 4(XP·레벨·퀴즈) 시작 — **사용자의 추가 승인 없이는 시작하지 않음**(요청하신 체크포인트별 승인 원칙)

## 다음 체크포인트 미리보기 (아직 미구현)

- 체크포인트 4: XP·레벨(`characters.level`/`exp` 컬럼, `character_activities` 원장), 퀴즈·시험(`character_exam_attempts`, 정적 문제은행, 회계사/가수 각 3~5문항), XP 지급(지식저장 +10/퀴즈정답 +5/시험합격 +50), 중복 지급 방지
- 체크포인트 5: DB 저장 통합 테스트 보강
- 체크포인트 6: Preview 배포·최종 검증·PR 생성
