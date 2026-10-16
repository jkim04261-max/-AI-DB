# API 자동 테스트

`npm test`로 실행됩니다 (`scripts/run-tests.cjs`가 `tests/*.test.cjs`를 전부 불러와 실행).

## 방식

이 저장소는 별도 테스트 프레임워크(Jest/Vitest 등)를 추가하지 않습니다. 대신:

1. `tests/bundle.cjs`가 esbuild로 `api/**/*.ts` 핸들러를 실제 코드 그대로 번들링합니다(타입만 제거, 로직은 무수정).
2. `tests/setup-postgres-mock.cjs`가 모든 `require('@vercel/postgres')`를 인메모리 mock(`tests/mock-postgres-impl.cjs`)으로 가로챕니다. 실제 DB 연결이 전혀 없습니다.
3. 각 테스트 파일이 Gemini/Resend 같은 외부 API 호출을 `global.fetch`를 직접 모의 응답으로 바꿔 가로챕니다 — **실제 네트워크 호출이나 비용이 발생하지 않습니다.**
4. 핸들러 함수를 모의 `req`/`res` 객체로 직접 호출하고 응답을 검증합니다.

## 왜 이 방식인가

- 새 테스트 프레임워크를 추가하지 않아 의존성이 늘지 않습니다(이미 `vite`/`@vercel/node`가 가져오는 `esbuild`를 `devDependencies`에 명시만 추가).
- 실제 Vercel 핸들러 코드(타입만 제거)를 그대로 실행하므로, "테스트용으로 다시 작성한 로직"이 아니라 실제 배포될 코드를 검증합니다.
- CI에 비밀값(AUTH_SECRET, GEMINI_API_KEY 등 실제 값)이 전혀 필요 없습니다 — 테스트 안에서 더미 값을 직접 설정합니다.

## 한계 (중요)

- **실제 Postgres 동작을 검증하지 않습니다.** `tests/mock-postgres-impl.cjs`는 이 코드베이스가 실제로 내리는 SQL 문의 "텍스트"를 패턴 매칭해 메모리에서 흉내 낼 뿐입니다. 특히 `api/_lib/dailyLimit.ts`의 동시성 안전성은 Postgres의 **문서화된** `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ...` 원자성에 의존하는데, 이 테스트는 그 가정이 성립한다고 두고 호출부 로직만 검증합니다 — 실제 Postgres 행 잠금을 테스트하는 것이 아닙니다.
- 브라우저 동작(React 컴포넌트, 실제 fetch, UI 렌더링)은 다루지 않습니다. 프런트엔드 변경은 여전히 Preview에서 수동 확인이 필요합니다.
- 새 API 엔드포인트나 핸들러 로직을 추가하면, `tests/mock-postgres-impl.cjs`에 그 SQL 문 패턴을 추가해야 할 수 있습니다(안 하면 "unhandled statement" 에러로 바로 실패하므로, 누락은 조용히 넘어가지 않습니다).

## 새 기능에 테스트를 추가하려면

1. `tests/<feature>.test.cjs`를 만들고 `module.exports = { run }` 형태로 작성(기존 파일 참고)
2. 필요하면 `tests/mock-postgres-impl.cjs`에 새 SQL 문 패턴 추가
3. `npm test`로 로컬에서 통과 확인 — PR을 열면 `.github/workflows/ci.yml`이 자동으로 같은 걸 실행합니다
