# PR #41 설계 확정 및 Vercel 함수 제한 해결 방안 (문서만, 코드 변경 없음)

PR #40(`docs/design/PR40-nuri-duri-growth-design.md`)의 7절 "남은 위험 / 확인 필요 항목"에 대해 사용자가 아래와 같이 확정했습니다. 이 문서는 그 확정 사항을 설계에 반영하고, PR #41 구현 전에 반드시 풀어야 하는 Vercel 서버리스 함수 12개 제한을 어떻게 해결할지 구체적으로 검토한 결과입니다. **이번 문서도 조사·설계만 담고 있으며, 코드·DB·설정 파일은 전혀 변경하지 않았습니다.**

## 1. 확정된 요구사항 (PR #40 7절 대응)

| PR #40 7절 항목 | 확정 내용 |
|---|---|
| 2. 누리·두리 동시 육성 가능 여부 | **동시 육성 가능**. `characters` 테이블의 `UNIQUE (user_id, companion_type)` 제약은 그대로 유지하되(한 사용자가 같은 종류를 2개 갖지는 못함), `companion_type IN ('nuri','duri')` 양쪽을 각각 1개씩, 즉 사용자당 최대 2개 행(누리 1개 + 두리 1개)까지 허용하는 것으로 확정. 설계 변경 없음 — PR #40의 스키마가 이미 이 요구를 그대로 만족합니다. |
| 3. 무료 회원의 성인 도달 가능 여부 | **무료 회원도 어린이 → 성인까지 성장 가능**. 유료/무료의 차이는 "시작 지점"에만 있고, 성장 엔진(레벨/경험치/시험)과 도달 가능한 최종 단계는 동일합니다. PR #40 3-3절의 가정이 그대로 확정되었습니다. |
| (3과 동일 질문의 유료측) | **유료 회원은 어린이 또는 성인 중 선택해서 시작**. PR #40 설계와 동일, 변경 없음. |
| 4. 시험 문항 출처 | **검증된 문제은행을 기본으로 하고, Gemini는 보조 출제·해설에만 사용**. 아래 2절에서 구체화. |
| 5. 가르치기 일일 한도 | **하루 10회, 기존 무료 질문 10회 제한과는 완전히 별도의 카운터**로 관리. 아래 3절에서 구체화. |
| 6. 플랜 변경 권한 | **관리자만 가능, 서버에서 검증**. 아래 4절에서 구체화. |
| 7. 사용자/캐릭터별 지식 분리 | **사용자 ID + 캐릭터 ID 이중 분리**. PR #40 5절의 비정규화(모든 테이블에 `user_id` 직접 포함) 설계가 이미 이 요구를 만족하며, 추가로 모든 조회·수정 쿼리가 `character_id`까지 함께 필터링해야 한다는 점을 이번 문서에서 명시적으로 규칙화합니다(5절). |
| 8. Vercel 12-함수 제한 해결 | 아래 5절에서 구체적인 최소 변경안을 확정합니다. |

## 2. 시험 문항 — 문제은행 기본 + Gemini 보조 (확정 반영)

- **기본 경로**: `src/data/characterExamQuestions.ts`(또는 직업별로 파일을 나눈 `src/data/exams/<jobId>.ts`)에 초급/중급/고급별 **고정 문항**을 정적 데이터로 저장합니다. 채점은 서버가 정답과 단순 비교하므로 Gemini 호출이 전혀 없는 경로입니다 — 이 경로만으로도 시험 기능이 완전히 동작합니다.
- **Gemini 보조 역할 (확정)**:
  1. **보조 출제**: 문제은행 문항이 부족한 직업/레벨에서, 운영자가 미리 승인한 "문항 생성 요청"을 Gemini로 돌려 초안을 만들고, **운영자 승인 후에만** 문제은행(정적 파일)에 반영합니다. 즉 Gemini가 생성한 문항이 검증 없이 바로 실제 시험에 나가는 경로는 설계하지 않습니다 — 응시자가 보는 모든 문항은 항상 "검증된 문제은행"을 통과한 것만 노출됩니다.
  2. **해설**: 응시자가 오답을 냈을 때, 그 문항의 정답/풀이를 바탕으로 Gemini에게 "왜 이 답이 맞는지 쉽게 설명해줘" 식의 보조 해설을 요청하는 것은 허용하되, 이는 `getGeminiReply`를 호출하는 **새로운 Gemini 연동 변경**이므로 CLAUDE.md 2번 규칙(Gemini 연동 보호)에 따라 PR #41 범위에는 포함하지 않고, 별도 PR(가제: #43 이후)로 분리해 명시적 승인을 받습니다.
- PR #41(캐릭터 뼈대) 단계에서는 시험 자체도 아직 구현하지 않으므로, 이 절은 PR #43(시험/레벨업) 설계 시점에 다시 참조할 내용으로 남겨둡니다.

## 3. 가르치기 일일 한도 — 기존 질문 제한과 완전히 분리 (확정 반영)

PR #40 설계의 `character_activities` 테이블만으로는 "검사 후 증가"가 원자적이지 않으므로, 기존 `daily_question_usage`(= `api/_lib/dailyLimit.ts`의 `reserveQuestion`)와 **완전히 같은 패턴, 완전히 다른 테이블/컬럼**으로 새 카운터를 둡니다:

```
daily_teach_usage
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  usage_date DATE NOT NULL              -- Asia/Seoul 기준, dailyLimit.ts와 동일 방식
  used_count INTEGER NOT NULL DEFAULT 0
  PRIMARY KEY (user_id, usage_date)
```

- `DAILY_TEACH_LIMIT = 10` 상수를 `api/_lib/characterGrowth.ts`(또는 별도 `api/_lib/teachLimit.ts`)에 정의하고, `reserveQuestion`과 동일한 `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE used_count < 10` 1문장 원자적 패턴을 그대로 재사용합니다.
- **기존 `DAILY_QUESTION_LIMIT`(채팅 질문 10회)와 `DAILY_TEACH_LIMIT`(가르치기 10회)은 서로 다른 테이블, 다른 카운터, 다른 코드 경로**이므로 한쪽을 많이 써도 다른 쪽에 전혀 영향이 없습니다 — "기존 무료 채팅 질문 제한과 별도로 관리"라는 확정 사항을 스키마 레벨에서 보장합니다.
- 이 테이블도 `isDailyLimitEnabled()`와 같은 자체 기능 플래그를 둘지는(처음부터 항상 켜져 있을지) PR #41~#42 구현 시점에 결정하면 됩니다 — 설계상 플래그 유무와 무관하게 테이블 구조는 동일합니다.

## 4. 플랜 변경 — 관리자만, 서버 검증 (확정 반영)

PR #40 설계는 "운영자가 DB를 직접 수동으로 갱신"하는 것까지만 가정했는데, 이번 확정으로 **관리자 전용 API 액션**을 명시적으로 설계에 포함합니다.

- `users.plan` 컬럼(PR #40 설계와 동일, `free`/`premium`, 기본값 `free`)은 **일반 사용자가 호출하는 어떤 엔드포인트에서도 절대 받지 않습니다** — 캐릭터 생성 API의 요청 본문에 `plan` 필드가 와도 서버는 무시하고 DB의 현재 값만 읽습니다(PR #40 3-3절 원칙 유지).
- 플랜을 바꾸는 유일한 경로는 관리자 전용 액션 하나뿐이고, 권한 검증은 **기존 `api/admin/stats.ts`의 `isAdminEmail(session.email)` 패턴을 그대로 재사용**합니다 — 새로운 권한 모델을 만들지 않습니다.
  ```
  POST /api/admin?action=set-plan   body: { userId: number, plan: 'free' | 'premium' }
  ```
  (5절에서 확정하는 `api/admin.ts` 통합 파일에 세 번째 action으로 추가되는 구조 — 새 서버리스 함수를 늘리지 않습니다.)
- 처리 순서는 기존 admin 엔드포인트와 동일합니다: `getSessionUser` → 세션 없으면 401 → `isAdminEmail` 아니면 403 → 통과 시에만 `UPDATE users SET plan = ... WHERE id = ...`.
- 이 변경 자체도 `users` 테이블에 컬럼을 추가하는 일(= PR #40 3-3절의 `users.plan`)이므로, PR #41에서 캐릭터 테이블과 함께 한 번에 추가하는 것을 제안합니다(별도 마이그레이션 단계로 쪼개지 않음 — 둘 다 "캐릭터 뼈대" PR의 최소 범위에 포함).

## 5. Vercel 서버리스 함수 12개 제한 해결 — 구체적 최소 변경안 (확정 요청 사항)

### 5-1. 현재 상태 (재확인)

`api/**/*.ts`(`_lib` 제외) 정확히 12개 — Hobby 플랜 한도에 꽉 차 있습니다. 새 파일을 1개라도 추가하면 즉시 13개가 되어 배포가 깨집니다.

### 5-2. 검토한 대안과 선택 이유

| 대안 | 검토 결과 |
|---|---|
| **A. 기존 admin 2개 파일을 1개로 통합** (채택) | `api/admin/stats.ts`와 `api/admin/ai-usage.ts`를 직접 읽어 확인한 결과, 둘 다 **GET-only, 읽기 전용**, 완전히 동일한 `isAdminEmail(session.email)` 권한 검증을 각자 복사해서 가지고 있고, 서로 다른 집계 쿼리만 날릴 뿐 상태를 공유하지 않습니다. 프런트엔드 호출부(`src/pages/AdminPage.tsx` 85번째 줄 `fetch('/api/admin/stats')`, 142번째 줄 `fetch('/api/admin/ai-usage')`)는 쿼리 파라미터나 요청 본문을 전혀 쓰지 않는 단순 `fetch(url)` 호출 2곳뿐입니다. 이미 저장소에 **똑같은 패턴의 선례**(`api/auth/password-reset.ts` + `vercel.json`의 `/api/auth/request-password-reset` → `/api/auth/password-reset?action=request` 리라이트)가 있어, 검증된 방식을 그대로 재사용할 수 있습니다. **프런트엔드 코드를 한 줄도 바꾸지 않고** 함수 개수만 12 → 11로 줄일 수 있습니다. |
| B. Vercel 유료 플랜으로 업그레이드 | 결제가 필요한 선택이고, "결제 기능 없이 설계만"이라는 이번 작업의 전제와 맞지 않아 제외. 비용 발생 여부를 사용자가 먼저 결정해야 하는 사안이라 이번 PR 범위에서 채택하지 않습니다. |
| C. 캐릭터 기능을 기존 파일(예: `api/conversations/[id].ts`)에 끼워 넣기 | 도메인이 완전히 다른 기능을 억지로 합치는 것이라 CLAUDE.md 2번 규칙(대화 기능 보호, 불필요한 구조 변경 금지)과 충돌할 위험이 커서 제외. |
| D. `api/gemini.ts` 삭제로 슬롯 확보 | **확인 완료**: `src/` 전체를 검색한 결과 프런트엔드 어디에서도 `/api/gemini`를 호출하지 않습니다(실제 채팅은 전부 `api/conversations/[id].ts`를 통함). `tests/`에도 이 엔드포인트를 직접 호출하는 테스트가 없습니다. 즉 **완전히 죽은 코드**로 보입니다. 다만 이 파일은 Gemini 연동 영역 자체이므로, CLAUDE.md 2번 규칙("Gemini 연동"은 명시적 요청 없이 건드리지 않음)에 따라 삭제 여부는 admin 통합(대안 A)과 별개로 **사용자의 명시적 확인을 받은 뒤에만** 진행합니다. |

**결론: 대안 A(admin 2개 통합)를 1차 방안으로 확정합니다.** 대안 D(`api/gemini.ts` 삭제)는 기술적으로는 더 간단하지만 Gemini 연동 파일을 건드리는 일이라 별도 확인 없이는 선택하지 않습니다 — 사용자가 D를 승인하면 A 없이 D만으로도 슬롯을 확보할 수 있고, 둘 다 승인하면 향후 성장 시스템 확장(PR #42 이후)에 여유 슬롯이 2개 생깁니다.

### 5-3. 대안 A의 구체적 변경 내용 (구현 시 그대로 적용할 계획, 이번 PR에서는 적용하지 않음)

- 신규: `api/admin.ts` — `req.query.action`으로 분기(`'stats' | 'ai-usage' | 'set-plan'`, `set-plan`은 4절에서 확정한 플랜 변경 액션). 각 action의 내부 로직은 기존 두 파일의 로직을 그대로 옮기고, `isAdminEmail` 중복 정의도 하나로 합칩니다(기존에 "독립성을 위해 의도적으로 복제했다"는 주석이 있었으나, 한 파일로 합쳐지는 순간 그 이유가 사라지므로 자연스럽게 중복이 제거됩니다).
- 삭제: `api/admin/stats.ts`, `api/admin/ai-usage.ts`
- 수정: `vercel.json`에 두 줄 추가
  ```
  { "src": "/api/admin/stats", "dest": "/api/admin?action=stats" },
  { "src": "/api/admin/ai-usage", "dest": "/api/admin?action=ai-usage" },
  ```
  (기존 password-reset 리라이트 2줄과 완전히 같은 위치/형식에 추가)
- **`src/pages/AdminPage.tsx`는 변경하지 않습니다** — 기존 URL(`/api/admin/stats`, `/api/admin/ai-usage`)이 리라이트로 그대로 동작하기 때문입니다.
- 함수 개수: 12 → 11(통합) → 12(캐릭터 API 1개 추가) — 정확히 한도에 다시 맞춰집니다. 이후 PR #42/#43에서 "가르치기"/"시험"을 새 파일로 추가하지 않고 **같은 `api/character.ts`에 action을 더 추가하는 방식**으로만 확장해야, 앞으로도 함수 개수가 늘지 않습니다 — 이 원칙을 PR #41 이후 모든 성장 시스템 PR에 적용합니다.

### 5-4. 검증 계획 (구현 시)

- `npm run typecheck:api`, `npm run build`, `npm run lint`로 정적 검증.
- `tests/`에 admin 두 엔드포인트의 기존 동작(권한 체크 401/403, 정상 응답 shape)을 검증하는 테스트가 있는지 확인하고, 없다면 통합 전/후 동일 응답을 보장하는 테스트를 추가합니다.
- Preview에서 실제 관리자 계정으로 `/admin` 페이지가 기존과 동일하게 통계·AI 사용 현황을 보여주는지 수동 확인(회귀 테스트 항목에 추가 제안: "관리자 대시보드 통계/AI 사용 현황 표시").

## 6. 캐릭터/지식별 접근 격리 — 쿼리 규칙 확정

PR #40 5절의 "모든 테이블에 user_id 비정규화" 설계에 더해, 이번 확정으로 아래 규칙을 PR #41 이후 모든 구현의 필수 체크리스트로 못박습니다:

- 캐릭터 하위 데이터(지식/활동/시험)를 다루는 모든 쿼리는 **`WHERE user_id = session.sub AND character_id = :characterId`를 항상 함께** 사용합니다 — `character_id`만으로 조회하는 코드는 리뷰에서 반려 대상입니다(다른 사용자가 남의 `character_id`를 추측해 요청하는 경우에도 `user_id` 조건이 막아줍니다).
- 캐릭터 자체를 조회/수정하는 쿼리(`characters` 테이블)도 기존 `conversations`/`messages`와 동일하게 `WHERE id = :id AND user_id = session.sub`로 소유권 확인과 조회를 한 문장에서 처리합니다(`api/conversations/[id].ts`의 기존 패턴 그대로).

## 7. 다음 단계

이 문서로 PR #40의 모든 "확인 필요" 항목이 해소되었습니다. 다음 작업(PR #41)은 아래를 포함합니다 — **실제 코드 작성은 이 설계에 대한 사용자 승인 이후에 시작합니다**:

1. `api/admin/stats.ts` + `api/admin/ai-usage.ts` → `api/admin.ts` 통합 (5절, 함수 슬롯 확보 선행 작업)
2. `users.plan` 컬럼 추가 (4절)
3. `characters` 테이블 + 캐릭터 생성/조회/삭제 API(`api/character.ts`, 신규 함수 1개로 슬롯 재충전)
4. `daily_teach_usage` 테이블 뼈대(3절 — 실제 "가르치기" 기능은 PR #42)
5. `/grow` 페이지 뼈대 + `GrowthContext` + `homeFeatures.ts`의 "AI 키우기" comingSoon → 실제 링크로 전환

### 추가로 확인이 필요한 항목
- `api/gemini.ts`를 미사용 코드로 함께 삭제할지(대안 D, 5-2절) — 삭제하면 함수 슬롯이 하나 더 남아 PR #42/#43에서도 여유가 생깁니다. Gemini 연동 보호 규칙에 따라 사용자 확인 후 진행합니다.
