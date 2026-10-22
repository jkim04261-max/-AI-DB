# PR #45 진행 상황 — 2D 캐릭터 육성 게임 MVP

이 문서는 세션이 중단되더라도 마지막 완료 지점부터 이어서 작업할 수 있도록, 체크포인트별 완료/남은 작업/변경 파일/테스트 결과/재개 방법을 기록합니다.

## 현재 상태

- **브랜치**: `claude/pr45-2d-growth-game-mvp` (base: `origin/main` @ `9302071`, PR #44 포함)
- **완료된 체크포인트**: 1(분석·설계), 2(2D 게임 화면·캐릭터), 3(캐릭터 대화·학습 연동), 3.5(DB 저장 구조 점검), 3.6(character_messages 대화 영구 저장), 4(XP·레벨·퀴즈·직업별 시험), 5(DB·보안·전체 기능 통합 검증)
- **진행 중**: 6(GitHub PR 생성·Vercel Preview 배포·최종 검증) — PR 생성·푸시·Preview 배포 성공, **사용자가 Preview에서 직접 기능 검증 완료**. 사용자가 Neon 콘솔에서 Production(`main`)과 Preview(`preview/claude/pr45-2d-growth-game-mvp`) 브랜치가 별도로 존재함을 확인(아래 "병합 전 최종 확인" 섹션 참고) — 다만 Vercel의 실제 `POSTGRES_URL`이 각각 그 브랜치를 정확히 가리키는지는 아직 **미확인**. **사용자의 최종 승인 전까지 main 병합·Production 배포 금지.**

## 체크포인트 6 — GitHub PR 생성·Vercel Preview 배포·최종 검증 (진행 중 — 사용자 기능 검증 완료, 최종 승인 대기)

### 사용자 Preview 직접 검증 결과 (전부 확인됨)
1. Preview에서 누리·두리 캐릭터 정상 표시 확인
2. Gemini 지식 검증 및 학습 대화 정상 확인
3. 누리의 가수 자격시험 합격 및 경험치 보상 확인
4. 누리 경험치 60/100 XP 확인
5. F5 새로고침 후에도 60XP 유지 확인(체크포인트 5에서 서버 재조회로 보장하려 했던 "새로고침 후 복원"이 실제 Preview 환경에서도 그대로 동작함을 실사용으로 재확인)

### 병합 전 최종 확인 — Production/Preview DB 분리

**사용자가 Neon 콘솔에서 직접 확인한 사실**: Production 브랜치 `main`(Default)과 PR #45 전용 Preview 브랜치 `preview/claude/pr45-2d-growth-game-mvp`가 별도로 존재함(총 브랜치 8개, 플랜 상한 10개). 이는 옵션 A(브랜치별 분리 유지)가 의도대로 Neon 쪽에 반영되어 있다는 직접적인 증거다.

**아직 미확인인 것**: Vercel 프로젝트가 실제로 이 두 브랜치를 Production/Preview 환경변수에 올바르게 연결해서 쓰고 있는지(= Neon에 분리된 브랜치가 "존재"하는 것과, Vercel의 `POSTGRES_URL`이 "그 브랜치를 실제로 가리키는 것"은 별개 확인 사항이다). 이 세션은 Vercel 대시보드에 접근할 수 없어 직접 확인이 불가능하다 — **비밀값(연결 문자열 전체, 비밀번호)은 이 세션도 사용자도 서로 공유하지 않는다**, 아래는 호스트/브랜치 이름만 비교하는 절차다.

**사용자가 Vercel 대시보드에서 확인할 정확한 경로** (UI 문구는 버전에 따라 다를 수 있음):
1. https://vercel.com/nuri-ai/ai-db 프로젝트 열기 → 상단 **Settings** → 좌측 **Environment Variables**.
2. 목록에서 `POSTGRES_URL`(및 Neon 통합이 함께 추가했을 `POSTGRES_URL_NON_POOLING`, `DATABASE_URL` 등 관련 변수들) 찾기. 변수 이름 옆에 어느 환경(Production/Preview/Development)에 적용되는지 뱃지가 표시된다.
3. **Production** 뱃지가 붙은 값을 펼쳐서(Reveal/Edit) 호스트명(`@` 뒤, `.neon.tech` 앞부분)만 확인 — 이 부분만 읽고 전체 문자열을 복사해 공유하지 않는다.
4. **Preview** 뱃지가 붙은 값도 동일하게 호스트명만 확인.
5. Neon 콘솔 → 해당 프로젝트 → **Branches** → `main` 브랜치 클릭 → "Connection Details"에서 호스트명 확인 → 3번의 Production 호스트명과 **일치하는지**만 대조.
6. 같은 방식으로 Neon의 `preview/claude/pr45-2d-growth-game-mvp` 브랜치 호스트명을 4번의 Preview 호스트명과 대조.
7. 더 빠른 대안: Vercel 프로젝트 → **Storage** 탭 → 연결된 Neon 통합 클릭 → (버전에 따라) "환경별 연결된 브랜치"를 표로 보여주는 화면이 있다면 거기서 바로 Production→`main`, Preview→`preview/claude/...`로 매핑되어 있는지 한눈에 확인 가능.
8. 호스트명이 각각 일치하면 격리 확인 완료, 불일치하거나(특히 Preview가 `main`과 같은 호스트를 가리키면) 즉시 공유해주시면 병합을 보류하고 원인을 조사하겠습니다.

### 체크포인트 6 최종 점검 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| GitHub Actions 전체 통과 여부 | **PASS** | PR #45 최신 커밋(`6eabb92`) 기준 `checks`(Typecheck API·Typecheck+build frontend·Lint·Test) 전부 성공, `e2e`(Playwright) 전부 성공. GitHub Checks API로 재확인(모든 세부 스텝 `completed`/`success`; 작업 전체의 최상위 `status` 필드만 수초간 `in_progress`로 지연 표시되는, 이전 커밋들에서도 반복 관찰된 GitHub 쪽 상태 전파 지연이었음). |
| Preview 배포 정상 여부 | **PASS** | GitHub 커밋 상태 API: `state: "success"`, "Deployment has completed"(최신 커밋 `6eabb92` 기준 재확인). 사용자가 실제 Preview URL에서 캐릭터·대화·시험·XP 기능까지 확인. |
| 기존 로그인·대화·이미지 첨부 기능 영향 여부 | **PASS** | (a) 코드 변경 없이 재확인된 회귀 테스트(`core-regression.test.cjs` 28/28, `e2e/chat.spec.ts`·`e2e/login.spec.ts`·`e2e/attachments.spec.ts`)가 전부 그대로 통과. (b) 사용자가 Preview에서 로그인 후 지식 검증(Gemini) 대화까지 정상 확인 — 로그인·Gemini 호출 경로가 실제로도 살아있음을 실사용으로 재확인. 이미지 첨부 자체는 이번 PR이 건드리지 않은 기능이라 사용자가 별도로 재확인하지는 않았음(해당 기능 코드 무변경, CI의 자동 테스트로만 커버). |
| Production과 Preview DB 분리 상태 | **미확인 (부분 확인됨)** | 사용자가 Neon 콘솔에서 Production(`main`)과 PR #45 전용 Preview(`preview/claude/pr45-2d-growth-game-mvp`) 브랜치가 별도로 존재함을 직접 확인(브랜치 8/10개). 다만 Vercel의 실제 `POSTGRES_URL`이 각 환경에서 그 브랜치를 정확히 가리키는지는 이 세션이 대시보드에 접근할 수 없어 확인 못함 — 위 "병합 전 최종 확인" 섹션의 절차대로 사용자가 직접 대조해 주셔야 한다(요청하신 조건 7). 실제 DB 주소·비밀번호·연결 문자열은 이 세션이 요청하거나 출력한 적 없다. |
| PR #45 변경 파일 및 보안 문제 | **PASS (이 세션의 자체 검토 기준)** | 25개 파일 변경(+4,432/-321줄, `git diff --stat origin/main...HEAD`로 확인). 전체 diff를 직접 재검토: SQL은 전부 `@vercel/postgres`의 태그드 템플릿(`sql\`...\``)만 사용해 문자열 결합 없음(인젝션 경로 없음), 새 프런트엔드 파일에 `dangerouslySetInnerHTML`/`eval`/`innerHTML` 등 위험 패턴 없음, 지식 검증 토큰의 `source` 필드는 서명된 토큰 안에서 허용 목록(`user_taught`/`ai_generated`)으로 검증 후에만 신뢰, 캐릭터 관련 action(quiz/exam 포함) 전부 `findOwnCharacter`로 소유권 검증(체크포인트 5에서 테스트로도 증명), 커밋에 비밀값·`.env` 파일 포함 없음. 다만 이는 **이 세션의 자체 코드 검토**이며 사람에 의한 실제 코드 리뷰는 아니다. |
| 남아 있는 오류 | 없음 | 로컬/CI 테스트(258/258 + 40/40), Preview 실사용 검증 모두에서 오류 발견되지 않음. |
| 미검증 항목 | 2건 | (1) Production-Preview DB 분리 상태(위 참고, main 병합 전 확인 필요). (2) 모바일 화면(요청하신 9번) — 사용자의 5개 확인 항목에 모바일 화면은 포함되지 않았음, CI의 `mobile-chromium` E2E 프로젝트(`e2e/mobile.spec.ts`)는 통과했으나 실제 기기에서의 확인은 아직 없음. |

### 종합 결론
GitHub Actions·Preview 배포·핵심 기능(캐릭터·지식검증·XP·레벨·시험·새로고침 복원)·기존 기능 회귀·코드 보안 자체 검토는 전부 **PASS**. **Production-Preview DB 분리 상태 미검증**이 main 병합 전 마지막으로 남은 확인 항목이다(요청하신 조건 7: "Preview 정상 배포와 DB 격리 검증 전에는 main 병합이나 Production 배포를 하지 마세요"). 모바일 화면 실기기 확인도 선택적으로 보강 가능하다. 사용자의 최종 승인 전까지 main 병합·Production 배포는 하지 않는다.

### Vercel Preview 배포 성공
- Neon 브랜치 설정을 조정해주신 뒤 재시도된 배포가 **성공**했다. GitHub 커밋 상태 API로 독립적으로 재확인: `state: "success"`, `"Deployment has completed"`.
- **Preview URL**: https://ai-db-git-claude-pr45-2d-growth-game-mvp-nuri-ai.vercel.app
- Vercel 검사 링크: https://vercel.com/nuri-ai/ai-db/7QEgMqRZcnzQjcpiKPzRNQf2QbvD

### 이 세션은 Preview를 직접 열어 검증할 수 없음 (네트워크 정책)
- `curl`로 Preview URL에 접속을 시도하자 `CONNECT tunnel failed, response 403`으로 거부됐다 — 이 샌드박스의 아웃바운드 네트워크 정책이 `vercel.com`뿐 아니라 **`*.vercel.app` 전체**를 막고 있다(이전에 겪은 Vercel 대시보드 접근 불가와 같은 종류의 제약). 브라우저 도구도 이 세션에는 연결되어 있지 않다.
- 따라서 요청하신 6번(로그인·누리/두리·대화 저장·지식 검증·스스로 공부하기·XP/레벨·퀴즈·시험 검증)과 9번(모바일 화면·캐릭터 표시)을 **이 세션이 직접 수행할 방법이 없다.**
- 8번(Preview-Production DB 공유 여부·데이터 격리) 역시 이 세션에서 직접 확인할 수 없다 — Preview가 어느 Neon 브랜치에 연결됐는지는 Vercel 대시보드(Settings → Environment Variables, Preview 환경의 `POSTGRES_URL`)에서만 확인 가능하다.
- **사용자 직접 테스트 요청**: Preview URL(위)을 직접 열어 로그인·캐릭터 생성/직업 선택·대화 저장·지식 검증·스스로 공부하기·XP·레벨 표시·퀴즈·직업별 시험·모바일 화면을 확인해 주시고, 가능하면 Preview에서 만든 테스트 데이터가 Production에는 나타나지 않는지(DB 격리)도 함께 확인해 주시면 감사하겠습니다. 문제가 있으면 알려주시면 코드를 수정하겠습니다.

### 완료한 것
- `claude/pr45-2d-growth-game-mvp` 브랜치를 origin에 푸시(`git push -u origin claude/pr45-2d-growth-game-mvp`) — 이 브랜치가 origin에 존재한 적이 없어 신규 푸시였다.
- `main`을 base로 PR 생성: **PR #45** — https://github.com/jkim04261-max/-AI-DB/pull/45 (요청하신 번호와 실제 번호가 정확히 일치)

### 블로커: Vercel Preview 배포 실패
- PR 생성 직후 Vercel 연동이 자동으로 Preview 배포를 시도했으나 **빌드 실패**(`state: "failure"`, "Deployment has failed")로 끝났다. Preview URL이 생성되지 않아(검사 결과 `previewUrl` 비어있음) 요청하신 6번(로그인·누리/두리·대화 저장·지식 검증·스스로 공부하기·XP/레벨·퀴즈·시험) 화면 검증과 9번(모바일 화면·캐릭터 표시)을 **수행할 수 없었다.**
- Vercel 배포 검사 링크: https://vercel.com/nuri-ai/ai-db/5mmNoUWpqUuH4i6UB9ffapHSihka (Vercel이 제시한 CLI 명령: `npx vercel inspect dpl_5mmNoUWpqUuH4i6UB9ffapHSihka --logs`)
- **이 세션(샌드박스)에서는 실제 빌드 로그를 확인할 수 없다**: Vercel CLI가 설치/인증되어 있지 않고, Vercel API 토큰도 없으며, 이 환경의 아웃바운드 네트워크 정책이 `vercel.com`을 허용 목록에 포함하지 않아 대시보드 접속 자체가 막힌다(`getaddrinfo ENOTFOUND vercel.com`). CLAUDE.md 6번 규칙("오류를 추측으로 수정하지 않는다")에 따라, 실제 로그를 보지 못한 채로 코드를 추측 수정하지 않았다.
- **정황 증거로 확인한 것** (코드 변경 없이 점검만):
  - 같은 프로젝트(`ai-db`)의 직전 PR #44는 동일한 Vercel 연동으로 정상 배포됨(`state: "success"`) — Vercel 프로젝트 설정 자체는 정상 동작한 이력이 있다.
  - Vercel 서버리스 함수 개수는 PR #44 merge 시점과 지금 동일하게 **12개**(이번 체크포인트 2~5에서 새 최상위 `api/*.ts` 파일을 추가한 적이 없음) — 함수 개수 제한 초과가 원인은 아닌 것으로 보인다.
  - 로컬에서 `npm run typecheck:api`(`tsc -b tsconfig.api.json`)와 `npm run build`가 모두 깨끗하게 통과한다 — 신규/수정 파일(`api/_lib/characterGrowth.ts`, `api/_lib/examQuestions.ts`, `api/character.ts` 등)에 타입 오류는 없다. 다만 Vercel의 Serverless Function 빌더(`@vercel/node`)는 이 로컬 `tsconfig.api.json`으로 타입 검사를 하지 않고 함수별로 독립 번들링하므로, 로컬에서 깨끗하다고 Vercel 번들링도 반드시 성공한다는 보장은 아니다.
  - GitHub Actions CI(이 PR의 `checks`/`e2e` 워크플로우, 같은 `npm run build`/`npm test`/`npm run test:e2e`를 실행)는 생성된 지 상당 시간이 지나도록 **"queued"(러너 할당 대기)** 상태에서 진행되지 않아, 이 체크포인트를 완료하는 시점까지 결과를 확인하지 못했다. 코드 문제가 아니라 Actions 러너/과금 쪽 별개 이슈일 가능성도 있다.
- **사용자 확인 요청**: 아래 중 하나를 알려주시면 원인을 특정해 최소 수정을 진행할 수 있습니다.
  1. Vercel 대시보드(또는 `npx vercel inspect dpl_5mmNoUWpqUuH4i6UB9ffapHSihka --logs`)에서 실제 빌드 오류 로그를 확인해 붙여넣어 주시거나,
  2. 이 Claude Code 세션에 Vercel 로그를 조회할 수 있는 방법(예: 이 저장소 연동 환경에서 접근 가능한 도구)이 있다면 알려주세요.

### 추가 증거 — 두 번째 배포도 실패 (문서 전용 커밋인데도)
- 위 블로커를 기록한 커밋(`f70d480`, `PR45_PROGRESS.md` 한 파일만 수정)을 푸시하자 Vercel이 다시 자동 배포를 시도했고, **역시 빌드 실패**했다(`dpl_7pBpXespxxomgDDBfZ3t8dZ42gZj`, inspect 링크: https://vercel.com/nuri-ai/ai-db/7pBpXespxxomgDDBfZ3t8dZ42gZj). 이번엔 "Building" 상태를 거쳐 Preview URL 슬롯(`ai-db-git-claude-pr45-2d-growth-game-mvp-nuri-ai.vercel.app`)까지 할당됐다가 최종적으로 Error로 끝났다.
- **이 커밋은 코드를 전혀 건드리지 않았는데도 동일하게 실패**했다는 것은, 원인이 이 커밋 자체가 아니라 체크포인트 2~5에서 누적된 코드 변경 어딘가(브랜치 전체 diff) 또는 코드와 무관한 Vercel 프로젝트/환경 설정에 있을 가능성을 가리킨다 — 둘 중 어느 쪽인지는 역시 빌드 로그 없이는 특정할 수 없다.
- 이 두 번째 실패까지 PR #45에 코멘트로 기록해 두었다: https://github.com/jkim04261-max/-AI-DB/pull/45#issuecomment-6342936274

### GitHub Actions CI는 깨끗하게 통과함 — Vercel만의 문제로 좁혀짐
- 오래 "queued" 상태였던 GitHub Actions CI(체크포인트 5 커밋 `d2ece18` 기준)가 완료되어 결과를 확인했다: **`checks`(Typecheck API·Typecheck+build frontend·Lint·Test) 전부 성공, `e2e`(Playwright Chromium, 전체 E2E) 전부 성공** — 둘 다 ubuntu-latest 클린 러너에서 `npm ci`로 의존성을 새로 설치한 뒤 실행됨.
- 이는 이 세션의 로컬 검증과 **독립적인** 재확인이다: 체크포인트 2~5의 코드가 깨끗한 환경에서도 빌드·타입체크·린트·전체 테스트(백엔드+E2E)를 전부 통과한다는 뜻이다.
- 따라서 Vercel 배포 실패의 원인이 **애플리케이션 코드의 컴파일/테스트 결함일 가능성은 낮아졌고**, Vercel 프로젝트 고유의 빌드·배포 파이프라인(환경변수, 빌드 설정, 계정/과금 상태 등) 쪽일 가능성이 더 높아졌다. 다만 이것도 추정이며, 확정하려면 여전히 Vercel 빌드 로그가 필요하다.

### 확인하지 못한 항목 (배포 실패로 인해 보류)
- Preview 화면 기능 검증(로그인/누리·두리 선택/대화 저장/지식 검증/스스로 공부하기/XP·레벨/퀴즈/직업별 시험) — Preview가 뜨지 않아 수행 불가.
- 모바일 화면·캐릭터 표시 확인 — 동일한 이유로 수행 불가.
- **Preview가 Production DB를 공유하는지 여부**: Vercel 프로젝트의 Storage/환경변수 설정(Settings → Environment Variables, Storage → Postgres)을 봐야 알 수 있는데, 이 세션에는 그 설정을 조회할 권한/접근 경로가 없다. `README.md`에는 `POSTGRES_URL`을 "Vercel 프로젝트에 Storage → Postgres를 연결하면 자동으로 채워진다"고만 되어 있어, Preview·Production이 같은 Neon 데이터베이스를 공유하는지 별도 브랜치를 쓰는지는 문서만으로 판단할 수 없다. **배포 자체가 실패해 어떤 코드도 실행되지 않았으므로, 이번 시도에서 실제 데이터를 건드린 적은 없다** — 다만 Preview가 재배포에 성공하더라도, 이 공유 여부가 확인되기 전까지는 데이터 변경을 동반하는 검증(지식 저장·퀴즈/시험 제출 등)을 보류하고 먼저 보고할 것이다(요청하신 조건 8 그대로 준수).
- 실제 Neon DB 연결·마이그레이션 필요 여부: 코드상 모든 테이블이 `ensureXTable()`의 `CREATE TABLE IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`로 요청이 들어올 때 지연 생성되는 구조이므로 별도 수동 마이그레이션은 필요 없을 것으로 보이나, 실제로 Preview가 뜬 뒤 최초 요청에서 정상 작동하는지는 아직 확인하지 못했다.

### 변경 없이 재확인된 것
- 로컬 `npm test`(258/258), `npm run test:e2e`(40/40), `npm run typecheck:api`/`npm run build`/`npm run lint` — 체크포인트 5에서 마지막 확인한 결과와 동일, 이번에 코드를 바꾸지 않았으므로 재실행하지 않았다.

### 근본 원인 — Neon DB 브랜치 상한 (사용자 확인, 옵션 A 채택)

사용자가 실제 Vercel 빌드 로그에서 "Neon DB 브랜치 제한 오류"를 확인해 알려주었다. 이 세션은 Vercel/Neon 대시보드에 접근할 수 없어 아래는 **직접 확인한 사실**과 **일반적인 Vercel-Neon 통합 동작 방식에 근거한 추정**을 구분해 기록한다. 코드·설정은 전혀 변경하지 않았다(옵션 A 채택, 조건 1·2·4·5 준수).

**직접 확인한 사실**
- 이 프로젝트는 Vercel의 네이티브 Neon 통합(Storage → Postgres)을 쓴다 — `@vercel/postgres`(공식적으로 "Neon 네이티브 통합으로 전환됨" deprecated 안내 있음) + `@neondatabase/serverless`(`package-lock.json`)가 의존성에 있고, `POSTGRES_URL` 하나의 키 이름을 Production/Preview/Development가 각각 다른 값으로 자동 주입받는 구조(`README.md`, `.env.example`).
- PR #44(10/20)는 같은 통합으로 정상 배포됐고, PR #45(10/22)는 코드 내용과 무관하게(문서만 바꾼 커밋 포함) 매번 동일하게 빌드 실패했다.
- GitHub Actions CI(`checks`/`e2e`)는 실제 Neon에 접속하지 않고 모의(mock) Postgres만 쓰므로(`tests/README.md`) 이 문제와 무관하게 전부 통과했다 — Neon 브랜치 문제가 애플리케이션 코드 문제가 아니라는 것과 들어맞는다.
- 사용자가 "매번 Neon 브랜치를 수동 삭제하는 임시방편"을 써왔다고 확인해주었다 — 브랜치 누적이 반복적으로 발생해온 기존 증상과 일치한다.

**추정 (실제 Vercel/Neon 설정 화면을 보지 못해 확정 불가)**
- Vercel-Neon 통합의 "Preview Branching"이 PR/Git 브랜치당 새 Neon 브랜치를 자동 생성하는 기본 동작으로 켜져 있을 것.
- "PR이 닫히거나 Git 브랜치가 삭제되면 Neon 브랜치도 자동 삭제"하는 정리(cleanup) 옵션이 꺼져 있거나, 켜져 있어도 로컬에서만 브랜치를 지우고 GitHub에서 PR을 정식으로 merge/close하지 않은 과거 작업 흐름 때문에 반영되지 않아 브랜치가 누적됐을 것.
- 현재 Neon 프로젝트의 실제 브랜치 개수·플랜별 상한 수치는 알 수 없다.

### 옵션 A — Preview DB 브랜치 자동 정리 활성화 안내 (사용자가 직접 대시보드에서 확인·적용, 이 세션은 실행하지 않음)

아래는 안내이며, **이 세션은 아래 어떤 설정도 대신 변경하지 않았다.** Vercel/Neon의 실제 UI 문구는 버전에 따라 다를 수 있으니, 아래 이름과 정확히 다르면 비슷한 의미의 항목을 찾아 확인해달라고 사용자에게 요청한다.

1. **Neon 콘솔 → 해당 프로젝트 → Branches 탭**: 현재 브랜치 개수와 각 브랜치가 어느 Git 브랜치/PR에 연결된 것인지 확인. **Settings → Billing**에서 플랜과 브랜치 상한 확인.
2. **Neon 콘솔 → Integrations → Vercel**(또는 Vercel 프로젝트 → Storage → 연결된 Neon 통합 → Manage/Settings): "Branching" 섹션에서
   - PR/Preview마다 새 브랜치를 만드는 옵션이 켜져 있는지(= PR별 Preview DB 분리 구조 유지, 조건 2에 부합하므로 그대로 둠),
   - "Delete branch when the PR is closed/merged" 또는 "Delete branch when the preview deployment is removed" 같은 **자동 삭제 옵션**이 켜져 있는지 확인. **꺼져 있다면 사용자가 직접 켜는 것이 이번 옵션 A의 핵심 조치다.**
3. 이미 쌓인 과거 브랜치(병합/종료된 옛 PR들의 것)는 자동 정리를 켜도 소급 삭제되지 않을 수 있다 — 그 경우 어떤 브랜치가 안전하게 지워도 되는지는 **사용자가 직접 판단해 대시보드에서 수동으로 삭제**해야 한다(이 세션은 어떤 브랜치도 대신 삭제하지 않는다, 조건 5).
4. 비용이 발생하는 플랜 업그레이드는 제안하지 않았고 진행하지도 않는다(사용자 지시 준수) — 상한을 늘리는 대신 "자동 정리로 브랜치 개수를 상한 아래로 유지"하는 방향으로만 안내한다.

### PR #45 Preview 재배포 재시도 절차 (최소)

1. 위 1~3번을 확인·적용해 Neon 프로젝트의 여유 브랜치 슬롯을 확보한다(사용자 직접 수행).
2. Vercel 대시보드 → 해당 프로젝트 → Deployments → PR #45의 가장 최근 실패한 배포에서 **Redeploy**를 누른다(불필요한 빈 커밋을 새로 만들 필요 없음 — 기존 실패 배포를 재시도하는 쪽이 더 깔끔하다). 또는 이 세션에 알려주면 트리거용 커밋을 하나 푸시할 수도 있다.
3. 배포 상태가 Building → Ready로 바뀌고 Preview URL이 생기는지 확인한다.
4. Preview URL이 뜨면, 이 세션이 이어서 조건 6~9(로그인·누리/두리·대화 저장·지식 검증·스스로 공부하기·XP/레벨·퀴즈·시험·모바일 화면)를 검증하고, **그와 함께 Preview에서 만든 데이터가 Production(실제 서비스)에는 나타나지 않는지도 함께 확인**한다 — 이 DB 격리 검증이 끝나기 전에는 main 병합·Production 배포를 하지 않는다(조건 7).
5. 전부 확인되면 결과를 정리해 보고한다.

main 병합·Production 배포는 하지 않았으며, Preview 정상 배포와 DB 격리 검증이 끝나기 전까지 하지 않는다.

## 체크포인트 5 — DB·보안·전체 기능 통합 검증 (완료)

새 기능 추가가 아니라 **검증 체크포인트**: 기존 구현(체크포인트 2~4)을 재작성하지 않고, 사용자별·캐릭터별 저장/소유권/부정 지급 방지/회귀/장기 기억 범위/개인정보처리방침 일치를 점검하고 발견된 공백만 최소 수정했다.

### 1~2. 사용자별·캐릭터별 DB 저장 및 소유권 검증

- `api/_lib/db.ts`의 모든 성장 관련 테이블(`characters`, `character_knowledge_entries`, `character_messages`, `character_exam_attempts`, `character_quiz_firsts`, `character_exam_firsts`, `daily_teach_usage`, `daily_study_usage`, `daily_question_usage`)이 `user_id INTEGER ... REFERENCES users(id) ON DELETE CASCADE` 또는 `character_id INTEGER ... REFERENCES characters(id) ON DELETE CASCADE`로 연결되어 있음을 코드로 재확인(새로 만든 것 없음, 기존 스키마 그대로).
- `api/character.ts`의 신규 action 4개(`quiz`/`quiz-submit`/`exam`/`exam-submit`)를 포함해 캐릭터를 다루는 **모든** action이 예외 없이 `findOwnCharacter(userId, companionType)`(= `WHERE user_id = $1 AND companion_type = $2`)를 거친 뒤에만 그 캐릭터의 하위 데이터(퀴즈/시험 기록, XP)에 접근하는지 핸들러 코드를 전부 읽어 확인. `applyExpGain`도 `UPDATE characters SET exp = ... WHERE id = $1 AND user_id = $2`로 이중으로 소유자를 재확인한다.
- **발견한 테스트 공백**: 기존 `tests/growth.test.cjs`는 `quiz`(GET)와 `exam-submit`(POST)만 "다른 사용자 차단(404)"을 테스트하고 있었음 — `quiz-submit`과 `exam`(GET)은 코드상 동일하게 보호되어 있었지만 테스트로 증명되어 있지 않았다. `tests/growth.test.cjs`에 두 action의 타인 차단(404) 테스트를 추가해 네 action 모두 증명했다(코드 수정 없음, 테스트만 추가).

### 3. 새로고침·재로그인 후 데이터 복원

- 기존 모의 DB 기반 테스트는 매 요청이 실제로 DB(모의) 레이어를 거치므로 "서버 재시작과 동등"하지만, **세션 쿠키를 새로 발급해 재사용하지 않는** 시나리오로는 테스트되어 있지 않았다. `tests/growth.test.cjs`에 재로그인 시뮬레이션(새 서명 쿠키 발급 후 캐릭터 목록 재조회)을 추가해 XP/레벨이 세션이 아니라 DB에서 나온다는 것을 증명했다.
- 화면 레벨에서도 공백이 있었다 — 기존 `e2e/growth.spec.ts`는 액션 응답을 받은 "직후"의 화면 갱신만 확인했고, 실제 `page.reload()`(전체 새로고침)로 캐릭터 목록을 처음부터 다시 받아오는 경로는 테스트되어 있지 않았다. `e2e/growth.spec.ts`에 새로고침 테스트를 추가(퀴즈로 얻은 XP가 `page.reload()` 후에도 서버가 돌려준 값으로 그대로 보이는지 확인).
- 체크포인트 3.6에서 이미 검증된 대화 기록 새로고침 복원(`e2e/knowledge.spec.ts`의 "reopening the panel... reloads the persisted conversation")은 재확인만 하고 추가 수정 없음.

### 4. 중복 요청·재제출·반복 제출을 통한 XP 부정 지급 방지

- 기존 테스트가 이미 **순차적** 중복(같은 문제 다시 정답, 이미 합격한 시험 재응시, 동일 `requestId` 재전송)은 전부 0XP로 막히는 것을 증명하고 있었다(체크포인트 4에서 작성).
- **새로 추가한 검증**: `Promise.all`로 같은 퀴즈 문제·같은 시험을 "동시에" 두 번 제출해, `character_quiz_firsts`/`character_exam_firsts`의 `INSERT ... ON CONFLICT DO NOTHING`이 두 요청 중 정확히 하나에만 XP를 지급하는지 확인(총 지급 XP가 두 응답 합쳐서 정확히 5/50이고, 두 배로 지급되지 않음).
- **남은 위험(기록)**: 이 리포지토리의 모의 Postgres(`tests/mock-postgres-impl.cjs`)는 동기적으로 동작해 진짜 DB 수준의 동시 트랜잭션 레이스 컨디션을 재현하지 못한다. 실제 동시성 보장은 Neon(Postgres)의 `PRIMARY KEY` 제약 + `INSERT ... ON CONFLICT DO NOTHING`이 트랜잭션 수준에서 원자적으로 처리해주는 것에 의존한다 — 코드 자체는 올바른 패턴(원자적 단일 SQL 문)을 쓰고 있으나, Preview/Production 환경에서의 실제 동시 요청 테스트(예: 부하 테스트)는 아직 수행되지 않았다는 한계를 남긴다.

### 5. 기존 기능 회귀 테스트

- 전체 테스트를 재실행해 **코드 변경 없이** 통과 확인: 일반 Gemini 대화·로그인·이미지 첨부(`core-regression.test.cjs` 28건, `e2e/chat.spec.ts`/`e2e/login.spec.ts`/`e2e/attachments.spec.ts`), 지식 검증·가르치기·스스로 공부하기(`knowledge.test.cjs` 63건, `e2e/knowledge.spec.ts`), 대화 영구 저장(`characterMessages.test.cjs` 32건), 하루 사용량 제한(`daily-limit.test.cjs` 30건), 비밀번호 재설정(`password-reset.test.cjs` 20건) — 전부 기존과 동일하게 동작, 회귀 없음.

### 6. 장기 기억(검색·재활용) 미구현 확인 및 향후 구현 범위

체크포인트 3.5·4에서 이미 "미구현"으로 기록한 사실을 재확인(여전히 미구현, 이번에도 구현하지 않음)하고, 향후 구현 시 검토할 범위를 다음과 같이 구체화해 기록한다 — **코드 변경 없음, 계획만 기록**:

- **범위 A (검증 품질 향상)**: `verify-knowledge`/`study-generate`가 Gemini를 호출할 때, 그 캐릭터가 과거에 "적합" 판정을 받은 지식 중 관련도 높은 항목 몇 개를 함께 프롬프트에 포함시켜 더 일관된 검증을 하도록 한다.
- **범위 B (출제 연계)**: 퀴즈·시험 문제가 현재는 전부 정적 문제은행(`api/_lib/examQuestions.ts`)인데, 사용자가 실제로 가르친/학습한 지식을 반영한 문제를 생성하는 것은 별도 설계가 필요하다(서버가 생성한 문제를 신뢰할 수 있게 저장·채점해야 하므로 체크포인트 4의 "서버 전용 정답" 원칙을 유지할 새 저장 구조가 필요).
- **검색 방식 후보**(우선순위 결정은 사용자 승인 필요, 지금 선택하지 않음): (a) 제목/키워드 문자열 매칭(현재 study-generate의 중복 방지 로직과 동일한 방식 — 구현 비용 가장 낮음, Gemini 호출 비용 증가 없음), (b) 임베딩 기반 유사도 검색(별도 벡터 컬럼/인덱스 또는 pgvector 필요 — Neon에서 지원 여부와 Vercel Hobby 비용 제약을 먼저 검토해야 함), (c) Gemini에 전체 학습 기록 요약을 캐싱해 전달(캐시 갱신 비용 발생, 요약이 오래되면 부정확해질 위험).
- **비용 영향**: 어떤 방식이든 Gemini 요청에 참고 자료가 추가되므로 토큰 사용량이 늘어난다 — 하루 호출 한도(`DAILY_TEACH_LIMIT`/`DAILY_STUDY_LIMIT`)를 그대로 둘지 재조정할지는 별도 결정이 필요하다.
- 이 범위는 **체크포인트 6 이후의 별도 기능 제안**이며, 지금 구현 여부를 결정하지 않는다.

### 7. 개인정보 보호 — 보유·삭제 정책과 실제 구현 일치 확인

- 삭제 기능(`api/account/delete.ts`)이 `DELETE FROM users WHERE id = ...` 한 문장으로 `characters`/`character_knowledge_entries`/`character_messages`/`character_exam_attempts`/`character_quiz_firsts`/`character_exam_firsts`/`daily_*_usage`까지 전부 `ON DELETE CASCADE`로 연쇄 삭제되는 것을 스키마 코드로 재확인(새 코드 없음).
- **발견한 공백**: `src/pages/PrivacyPage.tsx`가 체크포인트 3.5 시점(체크포인트 4 이전)에 작성되어, 체크포인트 4에서 새로 저장하기 시작한 "경험치·레벨·퀴즈·시험 응시 기록"이 수집 항목(1번)과 삭제 범위(4번) 설명에 빠져 있었다. **최소 수정**: 두 섹션과 3번 섹션의 TODO 안내문에 경험치·레벨·퀴즈·시험 응시 기록을 추가해 실제 구현과 일치시켰다(문구만 수정, 동작 변경 없음). `src/pages/AiNoticePage.tsx`는 퀴즈·시험이 Gemini를 호출하지 않으므로(체크포인트 4에서 이미 확인) 수정이 필요 없었다.

### 변경 파일
- 수정: `tests/growth.test.cjs`(+7건 — 소유권 검증 2건, 재로그인 복원 1건, 동시 중복 제출 방지 2개 시나리오·4건), `e2e/growth.spec.ts`(+1건 — 새로고침 복원), `src/pages/PrivacyPage.tsx`(경험치·레벨·시험 기록 문구 추가)
- 코드(동작) 변경 없음 — `api/character.ts`, `api/_lib/db.ts` 등 기존 구현은 전부 검증만 하고 수정하지 않았다.

### 테스트 결과
- `npm run typecheck:api` / `npm run build` / `npm run lint`: 통과(신규 경고 없음)
- `npm test`: **258/258 통과** (`growth.test.cjs`가 47 → 54건으로 확장, 나머지 전부 기존과 동일하게 통과 — 회귀 없음)
- `npm run test:e2e`: **40/40 통과** (`e2e/growth.spec.ts`가 3 → 4건으로 확장, 나머지 전부 기존과 동일하게 통과 — 회귀 없음)
- Vercel 함수 개수: **12 (변경 없음)**

### 남은 위험 (기록, 이번 체크포인트에서 해결하지 않음)
1. 모의 DB로는 실제 Postgres 트랜잭션 레이스 컨디션을 재현할 수 없다 — Preview/Production에서의 실제 동시 요청 부하 테스트는 아직 수행되지 않았다(위 4번 항목 참고).
2. 장기 기억(검색·재활용) 기능은 범위만 정리했고 구현되지 않았다(위 6번 항목 참고) — 사용자 승인 전까지 구현하지 않는다.
3. 지식/대화/퀴즈·시험 기록의 "개별 항목 단위" 삭제 기능은 여전히 없다(계정 전체 삭제로만 가능) — `PrivacyPage.tsx`의 TODO 안내문에 이미 명시되어 있으며, 별도 기능 제안 대상이다.

## 체크포인트 4 — XP·레벨·퀴즈·직업별 시험 (완료)

승인 조건 10개(사용자별·캐릭터별 영구 저장 / 지식저장+10·퀴즈+5·시험합격+50 XP / 서버 검증으로 무한 획득 방지 / 회계사·가수 3~5문항 시험, 서버 채점 / XP·레벨·성장 반응 화면 표시 / 기존 기능 보호 / 게임 성장과 실제 모델 능력 구분 / 장기 기억은 후속 과제로 명시 / Vercel 12-함수 유지 / 테스트+커밋)을 모두 반영.

### 구현 내용

**백엔드 (신규 action 4개, 함수 개수는 그대로 12 — 전부 기존 `api/character.ts` 안에 추가)**
- `api/_lib/characterGrowth.ts`(신규): XP 상수(`KNOWLEDGE_SAVE_EXP=10`/`QUIZ_CORRECT_EXP=5`/`EXAM_PASS_EXP=50`)와 레벨 공식(`levelForExp`/`levelProgress`, 레벨 N→N+1에 `N*100` XP 필요, 누적형).
- `api/_lib/examQuestions.ts`(신규, 서버 전용): 회계사 4문항·가수 4문항(각 체크포인트 조건의 3~5문항 범위 안), 정답 인덱스·해설 포함. **정답은 이 파일을 벗어나지 않는다** — 클라이언트로 보내는 모든 응답은 `correctIndex`/`explanation`을 제거한 안전한 모양으로 다시 투영한다.
- `api/_lib/db.ts`: `characters`에 `level`/`exp` 컬럼 추가(`ADD COLUMN IF NOT EXISTS ... DEFAULT`, 기존 캐릭터는 자동으로 Lv.1/0XP로 채워짐 — 데이터 손실 없음). `character_exam_attempts`(퀴즈·시험 응시 로그), `character_quiz_firsts`/`character_exam_firsts`(문항별/직업별 "최초 1회" XP 지급을 보장하는 원자적 멱등 테이블 — `INSERT ... ON CONFLICT DO NOTHING RETURNING`으로 동시 중복 요청·새로고침 재제출에도 XP가 두 번 지급되지 않음, 조건 3).
- `api/_lib/characterDialogue.ts`: `buildSavedReply`가 레벨업 여부를 받아 대사 끝에 "🎉 레벨업! 이제 Lv.N이에요!"를 덧붙이도록 확장. `buildQuizResultMessage`/`buildExamResultMessage` 추가. `KNOWLEDGE_VS_MODEL_DISCLAIMER` 상수 추가(조건 7 — "레벨·XP는 게임 속 성장 지표예요. 실제 Gemini AI 모델의 성능이 바뀌는 것은 아니에요.").
- `api/character.ts`:
  - `applyExpGain(userId, characterId, oldLevel, delta)`: XP를 서버에서만 더하고(`UPDATE characters SET exp = exp + $delta ... RETURNING exp`), 새 레벨을 재계산해 레벨이 바뀌었을 때만 `level` 컬럼을 다시 쓴다. 클라이언트는 얼마를 더할지 전혀 지정할 수 없다.
  - `?action=quiz`(GET): 직업에 맞는 문항 하나를 무작위로 골라 정답 없이 반환.
  - `?action=quiz-submit`(POST): 소유권 확인 → 문항 조회(직업 불일치면 400) → 서버에서만 채점 → 정답이고 **그 문항 최초 정답일 때만** `character_quiz_firsts`에 원자적으로 기록해 +5XP, 이미 맞혔던 문항이면 0XP(그래도 "정답" 자체는 매번 알려줌) → 응시 로그 저장 → 레벨업 대사까지 포함한 메시지 반환.
  - `?action=exam`(GET): 해당 직업의 전 문항(정답 없이) + 이미 합격했는지(`alreadyPassed`) 반환.
  - `?action=exam-submit`(POST): 제출한 답이 그 직업의 전 문항을 정확히 다 덮는지 검증(아니면 400) → 서버에서만 채점(`passed = score/total >= 0.6`) → **그 직업 최초 합격일 때만** `character_exam_firsts`에 원자적으로 기록해 +50XP, 이미 합격했으면 다시 봐도 0XP → 응시 로그 저장 → 레벨업 대사 포함 메시지 반환.
  - 지식 저장(`save-knowledge`): 저장이 실제로 새로 일어났을 때만(기존 `client_request_id` 멱등 체크 재사용 — 새 테이블 불필요) `applyExpGain`으로 +10XP, 중복 재요청(동일 `requestId` 재전송)은 0XP. 캐릭터 목록/생성/직업변경 응답에 `level`/`exp` 포함.

**프런트엔드**
- `src/data/characterGrowth.ts`(신규): `api/_lib/characterGrowth.ts`의 레벨 계산(순수 함수)과 `KNOWLEDGE_VS_MODEL_DISCLAIMER`를 프런트엔드용으로 그대로 옮김 — `api/_lib`는 서버 전용 빌드 경계라 프런트에서 import할 수 없어 작은 순수 함수만 복제(XP 지급 로직 자체는 서버에만 존재, 여기서는 서버가 돌려준 exp를 화면 표시용으로 환산만 함).
- `src/context/GrowthContext.tsx`: `Character`에 `level`/`exp` 추가, `getQuiz`/`submitQuiz`/`getExam`/`submitExam` 메서드 추가(기존 `verifyKnowledge`/`studyGenerate`와 동일한 fetch 패턴). `submitQuiz`/`submitExam`/`saveKnowledge`는 응답의 `level`/`exp`로 로컬 캐릭터 상태를 즉시 갱신.
- `src/components/grow/ExamPanel.tsx`(신규): "퀴즈 풀기"/"자격 시험 보기" 진입점 하나의 패널에서 제공. 정답을 클라이언트가 미리 알지 못하므로 선택 즉시 정오가 드러나지 않고, 제출 후 서버가 돌려준 결과(정오·해설·획득 XP·합격 여부)만 표시. 정답/오답에 따라 캐릭터 포즈를 `happy`/`sad`로 전환(기존 `onPoseChange` 재사용).
- `src/pages/GrowPage.tsx`: `CharacterCard`의 자리표시자였던 `Lv.1`/0%바를 실제 `character.exp`로 계산한 레벨·진행률·다음 레벨까지 남은 XP로 교체. "지식 가르치기" 버튼 옆에 "시험 보기" 토글 버튼 추가(`InteractionPanel`과 동일한 열고 닫기 패턴). `KNOWLEDGE_VS_MODEL_DISCLAIMER`를 카드마다 표시(조건 7).

### 보호 확인
- 로그인/회원가입, 일반 Gemini 대화, 이미지 첨부, 지식 가르치기·스스로 공부하기·대화 영구 저장(체크포인트 3/3.6) — 해당 로직 전혀 수정하지 않음. `save-knowledge`의 기존 성공 응답 모양은 그대로 유지하고 `expAwarded`/`exp`/`level`/`leveledUp` 필드만 추가(이미 있던 e2e 모킹 2곳이 새 필드를 기대하지 않아 실패했던 것을 발견해 그 모킹에 새 필드만 추가 — 로직은 바꾸지 않음).
- 실제 지식 수준(Gemini 검증 결과)과 캐릭터 레벨·XP(게임 성장 지표)를 명확히 분리 — 레벨/XP는 전적으로 `applyExpGain`이 쓰는 게임 전용 컬럼이며 Gemini 호출·검증 로직에는 전혀 영향을 주지 않는다. 화면에도 디스클레이머를 상시 표시(조건 7).
- 장기 기억(저장된 지식을 다음 대화에서 검색·재활용)은 **이번에도 구현하지 않음** — 체크포인트 3.5에서 이미 기록한 항목을 아래 "체크포인트 4 이후 별도 구현 항목"에 재확인·보강(조건 8).
- Vercel 함수 개수 12 유지(새 action 4개 전부 `api/character.ts` 내부, 새 파일 없음).
- DB: 기존 테이블·행을 삭제·초기화하지 않음, 전부 `ADD COLUMN IF NOT EXISTS`/`CREATE TABLE IF NOT EXISTS`.

### 변경 파일
- 신규: `api/_lib/characterGrowth.ts`, `api/_lib/examQuestions.ts`, `src/data/characterGrowth.ts`, `src/components/grow/ExamPanel.tsx`, `tests/growth.test.cjs`, `e2e/growth.spec.ts`
- 수정: `api/_lib/db.ts`, `api/_lib/characterDialogue.ts`, `api/character.ts`, `src/context/GrowthContext.tsx`, `src/pages/GrowPage.tsx`, `tests/mock-postgres-impl.cjs`, `e2e/knowledge.spec.ts`(+신규 `level`/`exp` 필드를 기대하는 기존 저장 응답 모킹 2곳에 필드 추가)

### 테스트 결과
- `npm run typecheck:api` / `npm run build` / `npm run lint`: 통과(신규 경고 없음, 기존 경고와 동일 종류)
- `npm test`: **251/251 통과** (`tests/growth.test.cjs` 신규 47건 — 신규 캐릭터 Lv1/0XP 시작, 퀴즈 정답 최초 1회만 +5XP(재시도 0XP), 오답 0XP, 직업 불일치 400, 시험 전 문항 정답 시 +50XP·재응시 0XP, 전 문항 미제출 400, 다른 사용자 차단 404, 지식 저장 +10XP·중복 requestId 0XP, 10회 반복 저장으로 레벨업 경계(정확히 exp=100에서 레벨업) 검증 등)
- `npm run test:e2e`: **39/39 통과** (`e2e/growth.spec.ts` 신규 3건 — 카드에 실제 레벨/XP·디스클레이머 표시, 퀴즈 정답 시 XP 반영, 시험 합격 시 +50XP 반영; 기존 지식 저장 테스트 2건은 새로 요구되는 `exp`/`level` 필드가 빠져 있어 실패했던 것을 모킹 응답에 필드만 추가해 수정)
- Vercel 함수 개수: **12 (변경 없음)**
- Gemini 호출 비용: 퀴즈·시험은 Gemini를 전혀 호출하지 않음(순수 서버 채점) — 이번 체크포인트로 늘어난 Gemini 비용은 0

## 체크포인트 3.6 — character_messages 대화 영구 저장 (완료)

체크포인트 3.5에서 발견한 가장 큰 공백("대화 피드가 DB에 저장되지 않음")을 해소. 제안했던 `character_messages` 스키마를 사용자가 승인, 조건 12개를 모두 반영해 구현.

### 구현 내용
- `api/_lib/db.ts`: `character_messages` 테이블 추가(`ensureCharacterMessagesTable`) — `user_id`/`character_id`/`speaker`(user|character)/`source`(user_taught|ai_generated)/`content`/`verification_status`(nullable, 적합·수정 필요·검증 불가 보존)/`knowledge_entry_id`(저장된 지식과 연결, 저장 전까지는 NULL). `character_knowledge_entries(id)`를 참조하므로 그 테이블이 먼저 준비되도록 순서를 맞췄다. 기존 테이블은 전혀 건드리지 않음(삭제·초기화 없음).
- `api/_lib/characterDialogue.ts`(신규): 체크포인트 3에서 프런트엔드에 있던 "캐릭터가 자신의 말로 반응하는 대사" 생성 로직을 서버로 옮김 — **서버가 직접 검증하여 저장**하도록(조건 2), 클라이언트는 더 이상 대사를 지어내지 않고 서버가 돌려준 문자열을 그대로 표시한다.
- `api/character.ts`:
  - `verify-knowledge`: 검증 직후 사용자 발화(`speaker='user'`) + 캐릭터 응답(`speaker='character'`, `verification_status` 포함) 2줄을 저장. **적합/수정 필요/검증 불가 전부 저장**(조건 7) — 적합일 때만 저장되는 `character_knowledge_entries`와 분리된 별도 로그이므로, 수정 필요·검증 불가 시도도 "검증된 지식"으로 섞이지 않는다. 로그 저장 자체가 실패하면 방금 소모한 일일 한도를 환불하고 500을 반환 — Gemini 검증은 성공했지만 대화가 저장되지 않은 상태를 "성공"으로 보여주지 않는다(조건 8).
  - `study-generate`: 캐릭터 발화 1줄만 저장(사용자가 입력한 게 없으므로). 같은 환불 원칙 적용.
  - `save-knowledge`: 저장된 지식 행의 `id`와 연결된 "저장했어요" 캐릭터 발화를 추가로 기록. 단, 이 로그는 best-effort로 처리— 지식 저장 자체(`character_knowledge_entries` INSERT)가 이미 성공했으므로, 그 뒤의 로그 기록이 실패하더라도 이미 성공한 저장을 "실패"로 보여주지 않는다(조건 8의 반대 방향도 지킴: 성공한 것을 실패로 보이게도 하지 않음).
  - `?action=messages`(신규 GET): 캐릭터의 전체 대화 기록을 시간순(오래된 것부터)으로 반환, `findOwnCharacter`로 소유권 검증(조건 5) — 다른 사용자의 캐릭터를 가리키면 404.
- `src/context/GrowthContext.tsx`: `listMessages()` 추가, `verifyKnowledge`/`studyGenerate`/`saveKnowledge`가 서버 생성 `characterReply`/`savedReply`를 반환하도록 확장.
- `src/components/grow/InteractionPanel.tsx`: 패널이 열릴 때 `listMessages`로 과거 대화를 불러와 대화 피드를 채운다(조건 3, 4) — 로컬 `buildTeachReply`/`buildStudyReply`/`buildSavedReply` 함수는 삭제하고 서버가 돌려준 문자열만 표시.
- `src/pages/PrivacyPage.tsx`: "AI 키우기 대화 기록" 수집 사실과 계정 삭제 시 함께 삭제됨을 명시(조건 11).

### 보호 확인
- 기존 Gemini 검증 서명 토큰(PR #44), 학습 기록(`character_knowledge_entries`), 로그인, 일반 채팅, 기존 DB 데이터 — 전부 무변경(조건 9, 10).
- Vercel 함수 개수 12 유지(새 action만 추가, 새 파일 없음).

### 테스트 결과
- `npm run typecheck:api` / `npm run build` / `npm run lint`: 통과(신규 경고 1건은 기존 3개 파일과 같은 종류)
- `npm test`: **204/204 통과** — `tests/characterMessages.test.cjs`(신규, 32건: 인증/소유권 검증/시간순 저장·조회/새로고침·재로그인 후 유지/캐릭터별 분리/수정 필요·검증 불가도 대화에는 남지만 학습 기록에는 안 남음/Gemini 호출 실패 시 대화 기록도 전혀 남지 않음 등)
- `npm run test:e2e`: **36/36 통과** — 기존 지식 검증/스스로 공부하기 테스트는 characterReply/savedReply 필드만 추가해 그대로 통과, 신규로 "패널을 다시 열면 서버에 저장된 대화를 그대로 불러온다" 테스트 추가(조건 3을 화면 레벨에서도 검증)
- Vercel 함수 개수: **12 (변경 없음)**
- 수동 스크린샷 확인: 이전에 나눈 대화(적합 1건 + 수정 필요 1건)가 패널을 열자마자 서버에서 그대로 복원되는 것을 확인

## 체크포인트 3.5 — DB 저장 구조 점검 (완료, 체크포인트 4 전 사용자 요청으로 삽입)

사용자가 "누리AI의 가장 중요한 사업 전략"으로 모든 대화·지식·검증·시험·XP가 사용자별·캐릭터별로 Neon에 지속적으로 저장되어야 한다는 요구사항을 제시, 체크포인트 4 전에 현재 저장 구조를 점검하도록 요청받음.

- 코드베이스 전체(일반 채팅 저장, 게임 지식 저장, 계정 삭제 cascade, 관리자 엔드포인트, 개인정보 관련 페이지)를 읽기 전용으로 감사.
- 발견한 사실 오류를 즉시 수정(코드 아님, 법적 고지 문서): `PrivacyPage.tsx`·`AiNoticePage.tsx`가 "회원탈퇴 준비 중", "AI 키우기 미구현"이라고 잘못 명시하고 있었음(둘 다 이미 배포됨) — 실제 수집 항목(캐릭터/지식/출처/검증 결과), 비공유·비공용학습 방침, DB 기반 "기억"과 실제 모델 재학습의 구분을 명시하도록 현행화.
- 대화 피드(가르치기/스스로 공부하기 중 캐릭터의 대사) 영속화, 수정 필요/검증 불가 결과 보존, 개별 지식 삭제 기능 등은 DB 스키마에 영향을 주는 별도 설계 사안으로 식별 — CLAUDE.md 8번 규칙에 따라 코드 변경 없이 설계안만 사용자에게 제시하고 승인 대기 중(체크포인트 3.6에서 구현 완료).
- 변경 파일: `src/pages/PrivacyPage.tsx`, `src/pages/AiNoticePage.tsx`
- 테스트: `npm run build`/`lint` 통과, `npm test` 172/172, E2E 35/35(모두 기존 그대로 — 내용 수정만, 동작 변경 없음)

### 장기 기억 기능 — 체크포인트 4에서도 미구현 (후속 개발 항목, 사용자 조건 8 재확인)

저장된 지식을 다음 대화에서 실제로 "검색·재활용"하는 장기 기억 기능(예: verify-knowledge나 퀴즈·시험 문제 생성이 과거에 가르친/학습한 관련 지식을 함께 참고해 더 똑똑하게 검증·출제하는 것)은 **체크포인트 3.5·3.6·4 어디에도 구현되어 있지 않다.** 체크포인트 4가 추가한 XP·레벨·퀴즈·시험은 전부 캐릭터_knowledge_entries/character_messages의 저장 여부·정오답 여부만 보고 판단하며, 저장된 지식 "내용"을 읽어 들여 활용하지 않는다(퀴즈·시험 문제은행은 `api/_lib/examQuestions.ts`에 미리 작성된 정적 문항이며 사용자가 가르친 내용과 무관). self-study(`study-generate`)가 중복 생성을 피하려고 과거 지식 제목 목록을 참고하는 것이 유일한 "활용" 사례이고, 이는 검색이 아니라 단순 중복 방지 목적이다. XP·레벨이 올라가는 것은 게임 성장 지표일 뿐 Gemini 모델이 실제로 더 많이 "기억"하거나 똑똑해졌다는 뜻이 아니다(화면에도 `KNOWLEDGE_VS_MODEL_DISCLAIMER`로 상시 고지). 이 구분을 혼동하지 않기 위해 체크포인트마다 명시적으로 재기록한다.

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

1. `git log --oneline -3` 로 마지막 커밋이 "PR #45 checkpoint 5" 커밋인지 확인
2. `npm ci`(node_modules 없으면) → `npm test` / `npm run build` / `npm run lint` / `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test` 로 현재 상태가 전부 통과하는지 재확인
3. 체크포인트 6(Preview 배포·최종 검증·PR 생성) 시작 — **사용자의 추가 승인 없이는 시작하지 않음**(요청하신 체크포인트별 승인 원칙). 이 브랜치는 아직 origin에 푸시되지 않았고 GitHub PR도 생성되어 있지 않다 — 체크포인트 6에서 푸시·PR 생성 자체도 사용자 승인 없이는 하지 않는다.

## 다음 체크포인트 미리보기 (아직 미구현)

- 체크포인트 6: Preview 배포·최종 검증·PR 생성(+ GitHub 푸시·PR 생성 승인 필요)
