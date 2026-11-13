# 예시문 복구 및 서버 이용권 구현 범위

## 확인한 기준
- main: 5e01813632abb99dff7393efa0f3f577e5eb3dd3 (#109).
- #108(d731054)의 InteractionPanel 조건 `!isToddlerStagedFlow`가 8~9세의 예시 선택 영역 전체를 숨김. 데이터(연령별 3개)와 입력 함수는 남아 있음.
- #102는 같은 InteractionPanel/성장 API와 충돌 가능성이 있는 과거 성장 미션 PR. 자동 병합/가져오기를 하지 않는다. 최신 main의 3:2:1 정책을 따른다.
- #101은 마켓 영구화 설계 문서만 존재. 서버 지갑·구매 원장은 main에 없음.

## 이번 수정
- 8~9세 1단계 동안 무료 예시 3개를 계속 표시. 선택하면 제목과 본문만 입력.
- toddler 예시는 knowhow로 분류하여 기존 직접입력3 → 객관식2 → 주관식1 게이트 유지.
- 비동기 검증/저장 중 선택 차단. 선택만으로 서버 호출·XP·용돈 변경 없음.
- 로그인, DB, Gemini, XP, 캐릭터 성장, 식사 이벤트 수정 없음.

## 서버 영속 구매: 구현 전 검토할 변경 범위
`useMockWallet`은 React 세션 상태이며 새로고침 시 초기화된다. `paymentService.charge`는 이 지갑의 spend만 호출한다. 따라서 이 결제를 서버 이용권과 연결하면 새로고침으로 자금이 복구되는 모순이 생긴다. 이번 PR은 구매 버튼이나 가짜 영속 이용권을 추가하지 않는다.

권장 스키마(제안, 미적용):
1. user_wallets: user_id PK, balance_won BIGINT CHECK >=0. 사용자 단위로 누리·두리가 공유. 초기 지급 10만원은 영구 1회인지 별도 결정. 기존 mock 잔액을 클라이언트 값으로 이관하지 않는다.
2. wallet_transactions: user_id, request_id, SKU, quantity, amount, timestamp; UNIQUE(user_id, request_id). 같은 키의 재요청은 같은 결과 반환, 다른 본문은 거부.
3. learning_tickets: user_id, ticket_type(example/question), quantity CHECK >=0. 미사용 이용권 무기한 보존. 무료량과 별도 집계.
4. usage_reservations: user_id, request_id, source(free/ticket), reservation_date(Asia/Seoul), state(reserved/completed/refunded). 실패 환급 시 현재 날짜 대신 원래 예약 날짜를 사용한다.

API: 서버리스 슬롯을 늘리지 않고 기존 character API의 wallet-status/market-purchase 액션과 기존 질문 경로를 이용한다. 기존 인증 사용자로만 처리하며 body의 user_id/balance/price를 신뢰하지 않는다. 구매는 PostgreSQL의 한 트랜잭션에서 잔액 조건부 차감+원장+이용권 증가를 처리한다. 수량은 정수 1~99, SKU별 고정 단가 10,000원, 새 요청 id와 버튼 잠금 사용. 소유자별 row lock/조건부 UPDATE로 동시 구매/사용 방어.

마켓: 학습·교육관에 예시문/질문 이용권 2종. 가격·보유 용돈·수량·차감액·구매 후 잔액과 확인창 표시. `paymentService`에 별도 비동기 서버 구매 함수를 추가하고 기존 mock charge는 재사용하지 않는다. 식사/알바/퀴즈의 mock 수입을 서버 재화로 옮기려면 모든 보상 검증까지 확대되어 별도 범위가 된다.

## 질문 제한 API 조사
- `api/_lib/dailyLimit.ts`: 무료 10개, KST 날짜별 daily_question_usage, 서버 조건부 증가.
- `api/conversations/[id].ts`: reserveQuestion 호출 2개 경로(메시지 POST와 assistant 재생성). 두 경로 모두 무료 우선 → 초과 시 question 티켓 예약 → 실제 응답 성공 시 확정. 실패 시 같은 예약 원천으로 복원해야 한다.
- 기존 client_request_id 재요청/재생(replay) 처리를 유지해 새로고침/중복 전송이 이중 소비로 이어지지 않도록 한다. 새 토큰/구매 키도 동일 멱등 보장을 적용한다.
- `api/auth/me.ts`: 잔여 무료량 표시용. 추가권 잔량은 별도 필드로 제공.
- `DAILY_QUESTION_LIMIT_ENABLED` 관리자 환경설정 유지. 꺼져 있으면 티켓도 소비하지 않음.
- `knowledgeLimit.ts`(직접 가르치기 검증), `studyLimit.ts`(AI 예시 생성)는 채팅과 별도 정책. 기본 예시 3개는 정적 무료 선택지, 추가 예시의 성공 생성/전달 시 example 티켓 1개 사용. 기존 무료 AI 공부하기 정책과 혼합하려면 우선순위를 명시해야 함.

## 안전 차단 및 승인 항목
- Preview/Production Neon 분리 증거가 없으므로 DB 접속·쓰기·마이그레이션·구매 실행 모두 미실시.
- 영구 지갑 소유 범위(사용자 공유 제안), 최초 지급, 기존 수입/식사와의 관계 및 기존 AI 공부하기 무료 정책의 처리에 대한 설계 검토 필요.
- 위 설계 승인과 분리된 Preview DB 확인 후에만 서버 코드와 SKU를 활성화한다.
- 실제 현금/구독 결제 없음. main 병합/Production 배포 없음.

## 검증 범위
예시 3개 표시, 반복 선택, 입력 반영, 선택만으로 POST 없음(PC/모바일)을 추가. 기존 전체 성장·질문 제한·실패 환급 테스트 실행. 신규 구매/재로그인 영속성/이용권 실패 복원 시나리오는 서버 기능 미구현이므로 미실행이며 통과로 보고하지 않는다.
