# 브라우저 E2E 테스트 (Playwright)

`npm run test:e2e`로 실행됩니다 (`playwright.config.ts` → `e2e/*.spec.ts`).

`tests/*.test.cjs`(API 핸들러를 직접 호출하는 유닛/통합 테스트, `tests/README.md` 참고)와는 다른 계층입니다. 이 디렉터리는 실제 Chromium으로 Vite 개발 서버 위의 **렌더링된 페이지**를 열고, 클릭·입력·새로고침 같은 진짜 브라우저 동작을 검증합니다.

## 방식

1. `playwright.config.ts`의 `webServer`가 `vite dev`를 `localhost:4173`에 띄웁니다. 실제 Vercel 서버리스 함수(`api/**/*.ts`)는 전혀 실행되지 않습니다.
2. 각 테스트는 `page.route('**/api/**', …)`로 **모든** `/api/**` 호출을 가로채 미리 정해둔 JSON으로 응답합니다(`e2e/fixtures/mock-api.ts`).
3. `failUnmockedApiCalls(page)`를 각 테스트 맨 앞에서 호출해, 그 테스트가 명시적으로 모의하지 않은 `/api/**` 호출이 들어오면 즉시 에러로 테스트를 실패시킵니다 — 모의하는 걸 잊은 엔드포인트가 조용히 실제 네트워크로 나가는 일을 막습니다.

## 왜 이 방식인가

- 이미 `npx playwright`로 실행 가능한 Chromium이 개발 환경에 설치되어 있어 새 브라우저 다운로드가 필요 없었습니다(다만 GitHub Actions 러너에는 없어, CI 워크플로우는 `npx playwright install --with-deps chromium`으로 매 실행 시 내려받습니다 — 아래 "CI" 참고).
- `tests/*.test.cjs`는 핸들러 함수를 직접 호출할 뿐 실제 브라우저 DOM·라우팅·새로고침 동작을 검증하지 않습니다. 이 레이어가 그 공백(로그인 폼 검증, 메시지 전송 후 화면 갱신, 새로고침 후 유지, 첨부 미리보기/삭제 UI, 모바일 레이아웃)을 메웁니다.
- 기존 테스트와 중복되지 않도록, 이미 `tests/`에서 충분히 검증된 서버 측 로직(SQL, Gemini 재시도, 일일 한도 원자성 등)은 다시 테스트하지 않고 프런트엔드 렌더링/상호작용만 다룹니다.

## 한계 (중요) — 모의 테스트 vs 실제 통합 검증

**이 디렉터리의 모든 테스트는 모의(mock) 응답 기반입니다.** 실제 Postgres, 실제 Gemini API, 실제 Resend, 실제 Vercel Blob 업로드 중 어느 것도 호출되지 않습니다.

- 실제 로그인(bcrypt 비교, AUTH_SECRET 서명 쿠키)은 검증하지 않습니다 — `/api/auth/login`을 모의 응답으로 대체합니다.
- 실제 Gemini 응답/재시도 동작은 검증하지 않습니다 — `tests/daily-limit.test.cjs` 등 기존 API 테스트가 이미 다룹니다.
- 첨부 테스트는 파일 선택 → 미리보기 → 삭제까지만 다루고 **"전송"은 누르지 않습니다.** `@vercel/blob/client`의 업로드 핸드셰이크(토큰 교환 + 실제 Blob storage로의 PUT)를 모의하려면 별도 설계가 필요해 이번 범위에서 제외했습니다 — 실제 이미지 업로드 완료 경로는 Preview에서 수동 확인이 여전히 필요합니다.
- `ChatPage`는 대화 목록이 아직 로드되기 전에 `/chat/:id`로 직접 진입(주소창 입력, 새로고침)하면 잠시 `/chat` 목록으로 리다이렉트되는 기존 동작이 있습니다(실 사용자는 보통 목록에서 클릭해 들어오므로 체감하기 어렵습니다). 이 테스트들은 `openChat()` 헬퍼로 목록 클릭을 거쳐 그 경쟁 상태를 피해가며, 새로고침 테스트도 이 동작을 전제로 작성되어 있습니다. 이번 PR에서 그 동작 자체를 바꾸지는 않았습니다 — 로그인/대화 저장 등 핵심 기능은 명시적 요청 범위 밖에서 수정하지 않는다는 원칙에 따른 것이며, 고치는 게 맞다면 별도 PR로 제안할 사안입니다.

## CI

`.github/workflows/ci.yml`의 `e2e` job이 PR/main push마다 자동 실행됩니다. `checks` job과 달리 매 실행마다 `npx playwright install --with-deps chromium`으로 브라우저를 내려받습니다(로컬 샌드박스에는 미리 설치되어 있어 필요 없었지만, GitHub Actions 러너에는 없습니다) — 이것이 이 job의 유일한 추가 비용이며, 외부 유료 API 호출은 없습니다.

## 새 테스트를 추가하려면

1. `e2e/<feature>.spec.ts`를 만들고 각 테스트 맨 앞에서 `failUnmockedApiCalls(page)`를 호출
2. 필요한 `/api/**` 응답을 `page.route()`로 직접 모의(실제 API 응답 모양은 해당 `api/*.ts` 핸들러 코드 참고)
3. `/chat/:id`로 들어가야 하면 `page.goto` 대신 `openChat(page, id)`를 사용(위 한계 항목 참고)
4. `npm run test:e2e`로 로컬에서 통과 확인 — 불안정하게 가끔 실패하면(재시도는 꺼져 있습니다, `retries: 0`) 원인을 고치지 않고 커밋하지 않습니다
