# PR #40 — 마이페이지·DB 점검 및 누리·두리 키우기 통합 설계

이 문서는 코드 변경 없이 조사와 설계만 담습니다. DB 마이그레이션·결제 연동·실제 구현은 포함하지 않으며, CLAUDE.md 8번 규칙("DB 구조에 큰 영향을 주는 기능은 화면 코딩부터 시작하지 않는다")에 따라 사용자 승인을 받은 뒤 PR #41부터 최소 단위로 구현을 시작합니다.

## 0. 현재 상태 (작업 시작 전 확인, CLAUDE.md 5번 규칙)

- **브랜치**: PR #40은 `origin/main`(커밋 `7dd3c4f`, PR #39 병합 완료) 기준의 새 브랜치 `claude/growth-system-design`에서 작업합니다.
- **미커밋 변경사항**: 없음 (조사 시작 전 `git status` clean).
- **관련 PR**: #39(E2E 테스트) main 병합 완료, Production 배포 확인됨. #28(마이페이지 기본 기능)은 아래 1절에서 실제 구현을 직접 확인했습니다.
- **main과의 차이**: 이 PR은 `docs/design/` 아래 설계 문서 1개만 추가합니다. 운영 코드(`api/`, `src/`) 변경 없음.

## 1. 기존 구현 상태 조사 결과

실제 코드를 직접 읽어 확인한 내용만 적습니다(추측 없음).

### 1-1. 로그인 / 세션
- `api/_lib/auth.ts`: 서버가 직접 서명하는 무상태(stateless) 세션. `AUTH_SECRET`로 HMAC-SHA256 서명한 쿠키(`sub`, `email`, `tokenVersion`, `exp`)만 사용 — 서버에 세션 테이블이 없습니다.
- 세션 페이로드에 **역할(role)이나 플랜(plan) 필드가 없습니다.** 비밀번호 재설정 시 `users.token_version`을 올려서 기존 쿠키를 전부 무효화하는 방식으로 "로그아웃을 강제"합니다.
- `api/admin/stats.ts`의 `isAdminEmail()`이 유일한 "권한" 분기 사례입니다 — DB 컬럼이 아니라 `ADMIN_EMAILS` 환경변수와 `session.email`을 매 요청마다 비교합니다.

### 1-2. 마이페이지 (`src/pages/MyPage.tsx`, PR #28)
- "무료 플랜" 배지는 **하드코딩된 문자열**입니다 — DB나 세션의 어떤 필드도 참조하지 않습니다.
- "프리미엄으로 업그레이드" 버튼은 `showComingSoon()`만 호출하는 **완전한 플레이스홀더**입니다. 결제/구독 로직은 코드베이스 전체에 전혀 없습니다(검색으로 확인 — `package.json`에도 결제 관련 의존성 없음).
- 표시하는 실제 데이터는 `user.email`과 `chats.length`(저장된 대화 수) 두 가지뿐입니다.
- `src/data/homeFeatures.ts`에 "AI 키우기"(태그: `누리·두리`) 카드가 이미 존재하지만 `action: { kind: 'comingSoon' }`로 **아직 아무 기능이 없습니다** — 이 PR이 설계하는 기능이 바로 이 카드가 가리키는 자리입니다.

### 1-3. Gemini 연동 (`api/_lib/gemini.ts`)
- `getGeminiReply(message, history, attachments?)` — 시스템 프롬프트(`systemInstruction`)를 전혀 사용하지 않습니다. `contents` 배열은 과거 대화 history + 현재 메시지/첨부로만 구성됩니다.
- 캐릭터 페르소나나 직업별 지식을 Gemini 호출에 주입하려면 **새 기능(시스템 인스트럭션 지원)이 필요**합니다 — 기존 호출 방식을 바꾸는 작업이므로 Gemini 연동 보호 규칙(CLAUDE.md 2번)에 따라 별도 PR + 명시적 승인이 필요합니다. 이번 설계에는 포함하되, 구현 범위는 뒤로 미룹니다(8절 참고).

### 1-4. 대화 저장 / Neon PostgreSQL (`api/_lib/db.ts`)
- 마이그레이션 전용 파일이 없습니다 — 모든 테이블이 각 `ensure*Table()` 함수의 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 **지연 생성**됩니다. 별도 마이그레이션 도구 없음.
- 현재 테이블: `users`, `password_reset_tokens`, `conversations`, `messages`, `message_attachments`, (기능 플래그 켜졌을 때만) `daily_question_usage`.
- 모든 사용자 데이터 조회/수정이 `WHERE user_id = ${session.sub}`(또는 그 체인)로 스코프됩니다 — 예외 없음. 계정 삭제(`api/account/delete.ts`)는 `DELETE FROM users WHERE id = ...` 한 줄로 끝나고, `conversations → messages → message_attachments`가 `ON DELETE CASCADE`로 자동 정리됩니다.

### 1-5. 배포 제약 (중요, 새로 확인)
- **Vercel Hobby 플랜 서버리스 함수 12개 제한**에 현재 코드베이스가 **정확히 12개**로 맞닿아 있습니다(`api/**/*.ts`, `_lib` 제외, 직접 카운트 확인). 이미 한 번 이 한계에 부딕혀 `password-reset.ts`(쿼리 파라미터로 요청/재설정 두 기능을 한 파일에 합침, `vercel.json` rewrite)와 `conversations/[id].ts`(GET/POST/DELETE를 한 파일에 합침)로 우회한 전례가 있습니다.
- **이번 설계의 가장 중요한 제약**: 새 API 엔드포인트 파일을 1개라도 추가하면 즉시 13개가 되어 배포가 깨집니다. PR #41부터는 반드시 ① 기존 파일 중 2개를 합쳐 슬롯을 먼저 확보하거나, ② 처음부터 "여러 기능을 한 파일에 action 파라미터로 다중화"하는 기존 패턴을 그대로 따라야 합니다. 8절에 구체적인 해법을 제안합니다.

## 2. 재사용 가능한 기존 구조 (재개발하지 않고 그대로 따를 패턴)

| 패턴 | 어디 | 새 기능에 적용 |
|---|---|---|
| 지연 테이블 생성 (`ensureXTable()`) | `api/_lib/db.ts`, `dailyLimit.ts` | 새 테이블도 동일하게 `ensureCharacterTables()` 하나로 |
| `WHERE user_id = session.sub` 전수 스코프 | `conversations/*`, `account/delete.ts` | 캐릭터·지식·활동·시험 테이블 전부 동일 적용 (7절) |
| 환경변수 기반 기능 플래그 (`isDailyLimitEnabled`, `isAdminEmail`) | `dailyLimit.ts`, `admin/stats.ts` | `users.plan` 컬럼 + (선택) `PREMIUM_EMAILS` 같은 운영자 수동 승급 수단 |
| 원자적 "검사 후 증가" 1-문장 UPDATE (`reserveQuestion`) | `dailyLimit.ts` | 하루 "가르치기" 횟수 제한(경험치 파밍 방지)에 그대로 재사용 |
| 정적 카탈로그는 DB가 아니라 `src/data/*.ts` | `homeFeatures.ts`, `chats.ts` | 직업 목록·시험 문항은 우선 정적 파일로 (6절) |
| Context/Provider (`AuthContext`, `ChatContext`) | `src/context/` | `GrowthContext`를 동일 구조로 신설 |
| 한 파일에 action 파라미터로 다중 엔드포인트 | `auth/password-reset.ts`, `conversations/[id].ts` | 성장 시스템 API 전체를 이 패턴으로 (8절) |
| 계정 삭제 시 FK CASCADE로 자동 정리 | `account/delete.ts` | 새 테이블도 `user_id REFERENCES users(id) ON DELETE CASCADE`만 지키면 `account/delete.ts`를 **한 글자도 수정할 필요 없음** |

## 3. 누리·두리 캐릭터 육성 시스템 설계

### 3-1. 캐릭터 모델
- 사용자 1명이 누리(남) / 두리(여) 각각 최대 1개씩 키울 수 있다고 가정합니다(둘 다 가질 수도 있음). **확인 필요**: 한 사용자가 둘 다 동시에 키울 수 있게 할지, 하나만 선택하게 할지 — 이 PR에서는 "둘 다 가능"으로 설계하되 사용자 확정을 받습니다.
- 성장 단계: `child`(어린이) → `adult`(성인). 세부 단계(예: 청소년)를 더 둘지는 레벨 구간 설계와 함께 다음 PR에서 확정합니다. 단계는 **레벨에서 파생**(DB 컬럼이 아니라 `api/_lib/characterGrowth.ts`의 레벨→단계 매핑 함수)시켜, 밸런스 조정이 마이그레이션 없이 코드만 바뀌도록 합니다 — `DAILY_QUESTION_LIMIT` 상수와 같은 방식입니다.

### 3-2. 성장 엔진 (공통, 무료/유료 동일)
사용자 → 캐릭터 → 활동 → 경험치 → 레벨 → 포인트 → 사용자 제공 데이터 → 동의 상태 → 정제 데이터 (CLAUDE.md 8번 규칙의 순서를 그대로 스키마에 반영):

```
users (기존 테이블에 컬럼만 추가)
  + plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium'))

characters                              -- 캐릭터
  id SERIAL PK
  user_id INT REFERENCES users(id) ON DELETE CASCADE
  companion_type TEXT CHECK (IN ('nuri','duri'))
  stage TEXT CHECK (IN ('child','adult'))   -- 레벨에서 파생되지만 조회 편의를 위해 비정규화 저장(denormalized), 레벨업 트랜잭션에서 함께 갱신
  level INT NOT NULL DEFAULT 1
  exp INT NOT NULL DEFAULT 0
  points INT NOT NULL DEFAULT 0
  job_id TEXT                              -- 정적 직업 카탈로그 id (6절), 선택 전엔 NULL
  created_at, updated_at
  UNIQUE (user_id, companion_type)

character_activities                     -- 활동 → 경험치/포인트 원장(append-only)
  id SERIAL PK
  character_id INT REFERENCES characters(id) ON DELETE CASCADE
  user_id INT REFERENCES users(id) ON DELETE CASCADE   -- 7절: 조인 없이도 바로 격리 검증 가능하도록 의도적 비정규화
  activity_type TEXT                       -- 'teach_objective' | 'teach_subjective' | 'exam_beginner' | ...
  exp_delta INT, points_delta INT
  metadata JSONB                           -- 시험 점수, 연계된 knowledge_entry id 등
  created_at
```

- `characters.level/exp/points`는 각 활동 INSERT와 **같은 트랜잭션**에서 함께 갱신합니다(`conversations.updated_at`을 메시지 INSERT와 같이 갱신하는 기존 패턴과 동일).
- 레벨업 임계값·경험치 보상표는 DB가 아니라 `api/_lib/characterGrowth.ts`의 상수/함수로 관리합니다.

### 3-3. 무료/유료 시작 지점 (결제 없이 권한 구조만)
- **무료 회원**: 캐릭터 생성 시 `stage`를 항상 `'child'`로 강제합니다.
- **유료 구독자**: 생성 시 `'child'` 또는 `'adult'`를 선택할 수 있습니다.
- 서버는 클라이언트가 보낸 plan을 절대 신뢰하지 않고, `users.plan`을 세션의 `session.sub`로 직접 조회해 판단합니다(기존 `isAdminEmail`이 `session.email`을 신뢰하는 것과 동일한 원칙).
- **결제 기능이 아직 없으므로**, `users.plan`을 `'premium'`으로 바꾸는 방법은 이번 설계 범위에서는 운영자의 수동 DB 갱신뿐입니다. (선택) `admin/stats.ts`의 `isAdminEmail` 패턴을 그대로 써서 관리자만 호출 가능한 "플랜 수동 변경" 액션을 추가할 수도 있으나, 이는 결제 연동이 아니라 순수 운영 도구이므로 범위 포함 여부는 사용자 확인이 필요합니다.
- 무료 회원도 `'child'`로 시작한 뒤 성장 엔진(레벨업/시험)을 통해 `'adult'`까지 도달할 수 있다고 가정합니다 — 즉 유료는 "시작 지점의 선택권"이고 무료는 "항상 자라서 도달"하는 차이입니다. **확인 필요**: 무료 회원의 최종 도달 가능 단계에 유료와 차등을 둘지(예: 무료는 성인 도달 후 기능 제한) 여부.

## 4. 직업별 지식·시험 DB/API 구조

### 4-1. 직업 카탈로그 — DB가 아니라 정적 데이터
`homeFeatures.ts`와 같은 패턴으로 `src/data/characterJobs.ts`(프런트 표시용)와 `api/_lib/characterJobs.ts`(서버 검증용, 동일 id 체계)를 둡니다. 직업이 바뀌어도 마이그레이션이 필요 없습니다. 레벨/단계가 특정 기준을 넘으면 `job_id`를 선택할 수 있게 됩니다(선택 자체는 DB write — `characters.job_id` UPDATE).

### 4-2. 지식 저장 — 가르치기 (객관식·주관식)
```
character_knowledge_entries
  id SERIAL PK
  character_id INT REFERENCES characters(id) ON DELETE CASCADE
  user_id INT REFERENCES users(id) ON DELETE CASCADE   -- 비정규화, 7절
  job_id TEXT NOT NULL
  question_type TEXT CHECK (IN ('objective','subjective'))
  raw_source TEXT NOT NULL          -- "사용자 제공 데이터" 그대로
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (IN ('pending','approved','rejected'))
  prompt TEXT                       -- "정제 데이터": 동의 후 정리된 질문
  answer TEXT                       -- 정제된 정답/모범답안
  choices JSONB                     -- 객관식일 때만, 선택지 배열
  created_at, refined_at
```
- 동의 전(`pending`) 데이터는 Gemini 호출에 절대 사용하지 않습니다 — `consent_status = 'approved'`인 행만 "정제 데이터"로 취급합니다.
- 경험치 파밍 방지: `reserveQuestion`과 동일한 "원자적 검사 후 증가" 패턴으로 하루 가르치기 횟수에 상한을 둡니다(정확한 숫자는 밸런스 결정 필요).

### 4-3. 시험 — 초급/중급/고급
```
character_exams
  id SERIAL PK
  character_id INT REFERENCES characters(id) ON DELETE CASCADE
  user_id INT REFERENCES users(id) ON DELETE CASCADE
  job_id TEXT NOT NULL
  exam_level TEXT CHECK (IN ('beginner','intermediate','advanced'))
  score INT NOT NULL
  passed BOOLEAN NOT NULL
  taken_at TIMESTAMPTZ DEFAULT now()
```
- 문항 출처는 1단계에서는 정적 카탈로그(직업별 고정 문항)로 시작하고, Gemini로 문항을 생성하는 것은 **별도 승인이 필요한 Gemini 연동 변경**이라 이번 설계에는 "향후 옵션"으로만 남겨둡니다.
- 합격 시 `character_activities`에 레벨업 활동 1건이 함께 기록되고, 고급 시험 합격이 `child → adult` 단계 전환의 조건 중 하나가 될 수 있습니다(3-3절의 확인 필요 항목과 연결).

### 4-4. 마이페이지 연결
`MyPage.tsx`의 기존 4개 섹션(계정정보/이용현황/업그레이드/계정관리)은 **그대로 두고**, 그 사이에 캐릭터 요약 섹션 1개만 추가합니다(이름/단계/레벨/직업 + "/grow로 이동" 버튼). 기존 섹션의 JSX나 로직은 한 줄도 바꾸지 않는 것을 완료조건으로 합니다.

## 5. 사용자별 지식 격리 설계 (요구사항 7)

- **모든 성장 시스템 테이블에 `user_id`를 직접(비정규화) 둡니다** — `character_id`만으로 조인해도 되지만, "서로 섞이지 않아야 한다"는 요구가 명시적이므로 모든 쿼리가 `character_id`뿐 아니라 `user_id = session.sub`까지 이중으로 필터링할 수 있게 합니다. 이는 `message_attachments`가 `messages`를 통해서만 간접적으로 격리되는 기존 방식보다 한 단계 더 엄격한 선택입니다.
- 모든 API는 `req.body`나 쿼리에 담긴 사용자 식별값을 **절대 신뢰하지 않고**, 기존 전체 코드베이스와 동일하게 `getSessionUser(req)`로만 사용자를 특정합니다.
- 캐릭터의 지식(`character_knowledge_entries`)은 그 캐릭터를 소유한 사용자의 Gemini 대화에만 쓰입니다 — 다른 사용자의 캐릭터·대화에 노출되는 경로를 만들지 않습니다. (미래에 "직업 비서"처럼 캐릭터 지식을 일반 채팅에 연결하는 기능이 생기면, 그 연결도 반드시 동일한 `user_id` 스코프를 유지해야 한다는 것을 설계 원칙으로 명시합니다.)
- 관리자 통계(`admin/stats.ts` 확장 시)는 `COUNT(*)` 같은 집계만 노출하고, 개별 사용자의 지식 내용을 절대 노출하지 않는 기존 원칙을 유지합니다.

## 6. 검증 결과 (이번 PR)

- `npm run typecheck:api`, `npm run build`, `npm run lint`, `npm test`(78개), `npm run test:e2e`(20개) — 코드 변경이 전혀 없으므로 전부 기존 상태 그대로 통과함을 재확인했습니다(회귀 없음).
- DB 마이그레이션, 결제 연동, 신규 API/프런트 코드는 작성하지 않았습니다.
- 비밀키·환경변수 값은 이 문서나 커밋 어디에도 출력하지 않았습니다.

## 7. 남은 위험 / 확인 필요 항목

1. **Vercel Hobby 12-함수 한계**: PR #41에서 새 엔드포인트를 추가하기 전에 반드시 기존 함수 2개를 통합해 슬롯을 확보해야 합니다(8절 제안 참고) — 이걸 먼저 안 하면 배포가 깨집니다.
2. 한 사용자가 누리·두리를 동시에 키울 수 있는지, 하나만 선택하는지 확정 필요.
3. 무료 회원이 성장으로 성인 단계까지 도달할 수 있는지, 아니면 유료와 차등을 둘지 확정 필요.
4. 시험 문항을 정적 데이터로 시작할지, Gemini로 생성할지 — 후자는 Gemini 연동 변경이라 별도 승인 필요.
5. "가르치기" 1일 상한 등 밸런스 숫자(경험치/포인트 보상, 레벨 임계값)는 아직 가설 값입니다 — PR #41 구현 전 확정 필요.
6. 결제 연동 없이 `users.plan`을 `'premium'`으로 바꾸는 운영자용 수단(관리자 API 또는 수동 DB 갱신)을 이번 범위에 포함할지 확인 필요.

## 8. PR #41 이후 최소 단위 개발 순서 (제안)

| PR | 범위 | 예상 수정/신규 파일 |
|---|---|---|
| #41-0 (선행 단계) | Vercel 함수 슬롯 확보: `api/admin/ai-usage.ts` + `api/admin/stats.ts` → `api/admin.ts` (action 파라미터 다중화, `vercel.json` rewrite 추가) | `api/admin.ts`(신규), `api/admin/ai-usage.ts`·`api/admin/stats.ts`(삭제), `vercel.json` |
| #41 | 캐릭터 생성/조회 뼈대만 (가르치기·시험 없음) | `api/_lib/db.ts`(캐릭터 테이블 ensure 함수 추가), `api/_lib/characterGrowth.ts`(신규, 레벨/단계 상수), `api/character.ts`(신규, GET/POST/DELETE 다중화), `src/data/characterJobs.ts`(신규), `src/context/GrowthContext.tsx`(신규), `src/pages/GrowPage.tsx`(신규), `src/data/homeFeatures.ts`(comingSoon → link), `src/App.tsx`(라우트 추가) |
| #42 | 객관식·주관식 가르치기 + 동의 플로우 | `api/_lib/db.ts`(지식 테이블), `api/character.ts`(teach action 추가), `src/pages/GrowPage.tsx`(가르치기 폼) |
| #43 | 초급/중급/고급 시험 + 레벨업 | `api/_lib/db.ts`(시험 테이블), `api/_lib/characterJobs.ts`(문항 데이터), `api/character.ts`(exam action 추가) |
| #44 | 마이페이지 연동 (추가 섹션만) | `src/pages/MyPage.tsx`(섹션 추가만, 기존 섹션 무변경) |
| #45 (옵션, Gemini 연동 변경 — 별도 승인) | 캐릭터 페르소나를 Gemini `systemInstruction`으로 주입해 실제 대화에 반영 | `api/_lib/gemini.ts`, `api/conversations/[id].ts` 또는 `api/character.ts` |
| — | 결제 연동 | 범위 밖, 별도 사업 결정 필요 시 추가 PR |

각 PR은 CLAUDE.md 1번 규칙에 따라 기능 1개 → 테스트 → PR → Preview 확인 → 사용자 승인 → main 병합 순서를 그대로 지킵니다.
