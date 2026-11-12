# PR #101 설계: 만능마켓 구매 → 스탯 보너스 영구 저장

## 배경

"직업 카드 맞추기 게임 연동 및 마켓 시스템 확장" 요청(3개 항목) 중 2번("만능마켓에서 구매하면 캐릭터 상태가 오르거나 꾸미기 아이템이 적용")을 구현하기 위한 설계 문서입니다. CLAUDE.md 8번 규칙(DB 구조에 큰 영향을 주는 기능은 설계 → 승인 → 구현 순서)에 따라, 코드 변경 없이 문서만 담았습니다.

## 사용자가 이미 확정한 사항 (세션 내 질의응답)

1. **카드 맞추기 게임의 지갑과 `/grow` 만능마켓의 지갑은 지금처럼 계속 분리** — 이 설계는 `/grow`(만능마켓)만 다룹니다. `/card-match`·`/job-quiz`는 건드리지 않습니다.
2. **만능마켓은 "체험판"에서 "정식 구현"(DB 영구 저장)으로 전환** — 새로고침해도 구매 내역이 유지되어야 합니다.
3. **"청결도" 같은 새 스탯은 만들지 않고, 기존 4개 스탯(지식·업무·소통·창의)에 보너스로 연결** — 프린세스 메이커류 돌봄 스탯과의 유사성 리스크를 피합니다.
4. **아이템 "꾸미기 적용"은 이 설계 범위 밖** — 의상·배경 장착은 이미 별도로 존재하는 ItemMarket(Gold 경제, `useMockInventory`/`CustomizationRoom`) 영역이고, 만능마켓(`UniversalMarket`, 원화 경제) 카탈로그는 의도적으로 그 시스템과 완전히 분리돼 있습니다(`universalMarketCatalog.ts` 코드 주석). 만능마켓 아이템을 실제 착용 가능한 의상 에셋으로 재매핑하는 건 범위가 다른 별도 작업입니다.
5. **구매 효과는 "카테고리별로 해당 스탯에 일정량 보너스"** — 아래 4절에서 구체안을 제안합니다.

## 조사로 확인한 핵심 사실 (코드 직접 읽음, 추측 없음)

- `useMockWallet.ts`/`UniversalMarket.tsx`: 현재 가상용돈·구매 내역 전부 React state뿐, DB 저장 없음(코드 주석: "실제 결제·DB 저장은 전혀 없다... 새로고침하면 사라진다"). 정식 구현으로 바꾸려면 **용돈 잔액 자체도 영구 저장**해야 앞뒤가 맞습니다(그렇지 않으면 새로고침마다 무한정 재구매해서 보너스를 쌓을 수 있음) — 5절의 열린 질문 1번.
- `characterStats.ts`: 지식·업무·소통·창의 4개 게이지는 **DB에 저장되지 않는 순수 파생값**(지식 저장 건수·메시지 수·시험 합격·레벨에서 그때그때 계산)이고, 코드 주석이 "진짜 스탯 시스템은 별도 설계 문서가 필요하다"고 이미 명시하고 있습니다. 구매 보너스를 이 파생값 계산에 **가산항으로만** 추가하면 기존 PR #47/#48 로직을 전혀 건드리지 않고 확장할 수 있습니다.
- `universalMarketCatalog.ts`: 10개 카테고리(직업관/학습·교육관/농업·원예관/여행·레저관/창작·콘텐츠관/생활·가전관/도구·연장관/업무·사무관/의상·패션관/게임·취미관), 아이템 20개, 가격 8,000~50,000원.
- Vercel 서버리스 함수가 **현재 정확히 12개**(Hobby 플랜 한도, PR #41 설계 문서에서 이미 확인된 제약)라서, 이번 작업도 **새 `api/*.ts` 파일을 추가하면 안 되고** 기존 `api/character.ts`에 새 `?action=` 분기로 넣어야 합니다(기존 `?action=usage`/`?action=exam` 패턴과 동일).
- `characters` 테이블 마이그레이션 관례: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 멱등하게, 기존 행은 전부 NULL/기본값으로 안전하게 통과(`api/_lib/db.ts` `ensureCharacterTables` 참고).

## 제안 설계

### 1. 새 테이블: `character_market_purchases`

```sql
CREATE TABLE IF NOT EXISTS character_market_purchases (
  id SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,       -- universalMarketCatalog.ts의 MarketItem.id
  category TEXT NOT NULL,      -- MarketCategoryId (10개 중 하나)
  price INTEGER NOT NULL,      -- 구매 시점 가격 스냅샷(카탈로그가 나중에 바뀌어도 과거 기록 불변)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_market_purchases_character_id_idx
  ON character_market_purchases (character_id);
```

구매 1건 = 1행(append-only 원장). 보너스는 이 테이블을 집계해서 "파생"하지, 별도 누적 컬럼에 따로 저장하지 않습니다 — `characterStats.ts`가 이미 따르는 "저장은 원본 활동 기록에만, 표시값은 그때그때 계산" 원칙과 일치시키기 위해서입니다(이중 장부로 어긋날 위험 제거).

### 2. 용돈 잔액 영구 저장 (열린 질문 1 — 아래 참고)

구매를 영구 기록하려면 잔액도 영구화해야 합니다. 제안:

```sql
ALTER TABLE characters ADD COLUMN IF NOT EXISTS market_balance_won INTEGER;
```
- `NULL` = "아직 온보딩(가상용돈 지급)을 안 받음" — 기존 `wallet.balanceWon === null` 의미와 동일하게 유지.
- 온보딩 완료 시 `GROW_INITIAL_ALLOWANCE_WON`(100,000원)으로 1회 초기화, 이후 구매할 때마다 서버에서 원자적으로 차감(`UPDATE ... SET market_balance_won = market_balance_won - $price WHERE market_balance_won >= $price` 패턴 — 잔액 부족 시 0 rows 업데이트로 실패 판별, `daily_teach_usage`류 기존 "검사 후 증가" 패턴 재사용).

### 3. 카테고리 → 스탯 매핑 (제안값, 밸런스는 확정 아님)

| 카테고리 | 매핑 스탯 | 구매당 보너스 |
|---|---|---|
| 학습·교육관 | 지식 | +4 |
| 업무·사무관 | 업무 | +4 |
| 직업관 | 업무 | +3 |
| 도구·연장관 | 업무 | +2 |
| 창작·콘텐츠관 | 창의 | +4 |
| 의상·패션관 | 창의 | +2 |
| 게임·취미관 | 창의 | +2 |
| 여행·레저관 | 소통 | +3 |
| 농업·원예관 | 소통 | +2 |
| 생활·가전관 | 소통 | +2 |

`computeStatGauges`에 `purchaseBonusByStat: Partial<StatGauges>` 같은 선택 인자를 추가해, 기존 계산 결과에 더하고 `clampPct`로 0~100에 재클램프 — 기존 호출부(가중치 로직 등)는 전혀 안 바뀝니다.

### 4. API

`api/character.ts`에 새 액션 2개 추가(새 파일 없음, 위 Vercel 제약 때문):
- `GET ?action=market-purchases` — 로그인한 사용자의 해당 캐릭터 구매 내역 + 카테고리별 합계 반환.
- `POST ?action=market-purchase` — `{ companionType, itemId }` 받아 서버가 `universalMarketCatalog`에서 가격 조회(클라이언트 가격 신뢰 안 함) → 잔액 원자적 차감 → `character_market_purchases` 1행 삽입. 기존 `setProfession` 핸들러처럼 `user_id` + `character_id`로 항상 스코프.

## 범위 밖 (이번 설계에 포함 안 함)

- ItemMarket(Gold, 의상/배경 장착)은 건드리지 않습니다 — 이미 별도 체계입니다.
- 만능마켓 아이템의 "꾸미기 적용"(실제 캐릭터 외형 변경)은 포함하지 않습니다.
- `/card-match`·`/job-quiz`의 독립 지갑은 그대로 둡니다.
- 3번 요청(가이드북 업데이트)은 이 설계가 승인된 뒤, 실제 동작이 확정되면 그 내용을 반영해 별도 PR로 진행합니다.

## 확인이 필요한 항목

1. **용돈 잔액도 영구 저장할지(2절)** — 안 하면 "구매는 무한 반복 가능, 보너스는 영구 누적"이 되어 밸런스가 깨집니다. 영구화가 맞다고 보고 설계했는데, 맞는지 확인 부탁드립니다.
2. **3절의 보너스 수치** — 임의의 게임 밸런스 값입니다. 이대로 할지, 더 낮추거나(남용 방지) 다르게 배분할지 의견 주세요.
3. **보너스 상한선(최대 몇 회까지 같은 카테고리 보너스를 인정할지)** — 현재 안은 무제한 누적이라 극단적으로 많이 사면 즉시 100%를 채울 수 있습니다. 하루 10회 지식 검증 제한 같은 기존 패턴처럼 **카테고리당 하루 구매 횟수 제한**을 둘지 확인 부탁드립니다.

## 결론

이 PR은 설계 문서만 담고 있어 기존 기능에 영향이 없습니다. **사용자 승인 없이는 구현을 시작하지 않으며, 위 3가지 확인 항목에 대한 답을 받은 뒤 실제 구현 PR을 진행합니다.**
