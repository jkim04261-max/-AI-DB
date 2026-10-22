# PR #45 진행 상황 — 2D 캐릭터 육성 게임 MVP

이 문서는 세션이 중단되더라도 마지막 완료 지점부터 이어서 작업할 수 있도록, 체크포인트별 완료/남은 작업/변경 파일/테스트 결과/재개 방법을 기록합니다.

## 현재 상태

- **브랜치**: `claude/pr45-2d-growth-game-mvp` (base: `origin/main` @ `9302071`, PR #44 포함)
- **완료된 체크포인트**: 1(분석·설계), 2(2D 게임 화면·캐릭터)
- **다음 체크포인트**: 3(캐릭터 대화·학습 연동) — **사용자 추가 승인 대기 중**, 아직 시작하지 않음

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

## 재개 방법 (세션이 중단된 경우)

1. `git log --oneline -3` 로 마지막 커밋이 "PR #45 checkpoint 2" 커밋인지 확인
2. `npm ci`(node_modules 없으면) → `npm test` / `npm run build` / `npm run lint` / `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test` 로 현재 상태가 전부 통과하는지 재확인
3. 체크포인트 3(캐릭터 대화·학습 연동 통합) 시작 — **사용자의 추가 승인 없이는 시작하지 않음**(요청하신 체크포인트별 승인 원칙)

## 다음 체크포인트 미리보기 (아직 미구현)

- 체크포인트 3: 가르치기/스스로 공부하기 통합 대화형 UI, `api/character.ts`에 `study-generate` action 추가(스스로 공부하기, 하루 3회 별도 제한), `character_knowledge_entries.source` 컬럼(`user_taught`/`ai_generated`) 추가
- 체크포인트 4: XP·레벨(`characters.level`/`exp` 컬럼, `character_activities` 원장), 퀴즈·시험(`character_exam_attempts`, 정적 문제은행), 중복 지급 방지
- 체크포인트 5: DB 저장 통합 테스트 보강
- 체크포인트 6: Preview 배포·최종 검증·PR 생성
