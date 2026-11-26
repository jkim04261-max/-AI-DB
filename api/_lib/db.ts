import { sql } from '@vercel/postgres'

let usersTableReady: Promise<unknown> | null = null

export function ensureUsersTable() {
  if (!usersTableReady) {
    usersTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      // Bumped on password reset so every session cookie signed before that
      // point (they carry the version they were signed with) fails the
      // check in getSessionUser — the only way to invalidate an already-
      // issued stateless session without a server-side session store.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`
      // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): "AI 추천 충전권"/
      // "지식 검증 충전권"을 구매했을 때 실제로 쌓이는 계정 단위 이용권
      // 수량 — daily_teach_usage/daily_study_usage와 마찬가지로 user_id
      // 기준이다(캐릭터별이 아니다). 그 두 하루 한도가 companionType과
      // 무관하게 계정 전체에 공유되는 것과 똑같이, 이 이용권도 누리/두리
      // 어느 쪽에서 구매하든 같은 풀을 쓰고, 어느 쪽에서든 바로 쓸 수
      // 있어야 자연스럽다(캐릭터 테이블에 뒀다면 한쪽에서 산 이용권을
      // 다른 캐릭터에서 못 쓰는 불일치가 생긴다).
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_recommend_tickets INTEGER NOT NULL DEFAULT 0`
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS knowledge_validation_tickets INTEGER NOT NULL DEFAULT 0`
    })().catch((err) => {
      usersTableReady = null
      throw err
    })
  }
  return usersTableReady
}

let passwordResetTableReady: Promise<unknown> | null = null

// One row per issued reset request; only the token's hash is stored (never
// the raw token the user receives by email), mirroring how password_hash
// never stores the plaintext password. A row becomes unusable once
// used_at is set or expires_at has passed — checked in api/auth/reset-password.ts.
export function ensurePasswordResetTable() {
  if (!passwordResetTableReady) {
    passwordResetTableReady = (async () => {
      await ensureUsersTable()

      await sql`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_created_at_idx
          ON password_reset_tokens (user_id, created_at DESC)
      `
      await sql`
        CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
          ON password_reset_tokens (token_hash)
      `
    })().catch((err) => {
      passwordResetTableReady = null
      throw err
    })
  }
  return passwordResetTableReady
}

let conversationsTablesReady: Promise<unknown> | null = null

export function ensureConversationsTables() {
  if (!conversationsTablesReady) {
    conversationsTablesReady = (async () => {
      await ensureUsersTable()

      await sql`
        CREATE TABLE IF NOT EXISTS conversations (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS conversations_user_id_updated_at_idx
          ON conversations (user_id, updated_at DESC)
      `

      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
          ai_provider TEXT,
          content TEXT NOT NULL,
          is_error BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
          ON messages (conversation_id, created_at)
      `

      // Legacy single-attachment columns. Superseded by message_attachments
      // below (a message can now carry multiple images), but left in place
      // — unused by new writes — instead of dropping them, since the
      // backfill below still reads out of them.
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT`
      await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`

      // One row per image (Vercel Blob URL + metadata; the file itself
      // never touches Postgres), so a single message can carry more than
      // one attachment.
      await sql`
        CREATE TABLE IF NOT EXISTS message_attachments (
          id SERIAL PRIMARY KEY,
          message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          url TEXT NOT NULL,
          mime_type TEXT,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS message_attachments_message_id_position_idx
          ON message_attachments (message_id, position)
      `

      // One-time (idempotent) backfill: copy any pre-existing single
      // attachment into the new table as its message's first (and only)
      // attachment, so older conversations keep showing their image after
      // this migration. Safe to re-run — the NOT EXISTS guard skips
      // messages that already have a row here.
      await sql`
        INSERT INTO message_attachments (message_id, position, url, mime_type, name)
        SELECT id, 0, attachment_url, attachment_mime_type, attachment_name
        FROM messages
        WHERE attachment_url IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM message_attachments ma WHERE ma.message_id = messages.id
          )
      `
    })().catch((err) => {
      conversationsTablesReady = null
      throw err
    })
  }
  return conversationsTablesReady
}

let characterTablesReady: Promise<unknown> | null = null

// One row per character a user has started growing. `companion_type` fixes
// which of the two fixed companions (누리/두리) the row is — a user may
// have at most one of each (see the UNIQUE constraint), never two of the
// same. `stage` starts at 'child' for every account today: there is no
// payment/plan system yet, so nothing can create a character as 'adult' —
// see api/character.ts, which never reads a client-sent stage at all.
export function ensureCharacterTables() {
  if (!characterTablesReady) {
    characterTablesReady = (async () => {
      await ensureUsersTable()

      await sql`
        CREATE TABLE IF NOT EXISTS characters (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          companion_type TEXT NOT NULL CHECK (companion_type IN ('nuri', 'duri')),
          stage TEXT NOT NULL DEFAULT 'child' CHECK (stage IN ('child', 'adult')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (user_id, companion_type)
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS characters_user_id_idx ON characters (user_id)
      `

      // Nullable, additive column (PR #43) — every existing character row
      // already satisfies "no value yet" (NULL), so this never touches or
      // resets a single existing row. NULL means '직업 미선택'. Kept as a
      // plain column on `characters` itself (not a separate table) since a
      // character has at most one current profession; a future
      // knowledge/exp system should key its own rows by character_id and
      // snapshot whichever profession applied at the time, rather than
      // always deferring to this (mutable) column — see api/character.ts's
      // handlePatch for why changing it never deletes the character.
      //
      // PR #51(직업 선택 제한 해제, 2026-11-01): 처음엔 회계사·가수 2개만
      // 저장 가능했지만, 이제 50개 직업 전체를 캐릭터의 목표 직업으로
      // 저장할 수 있다 — "문제 풀기"(퀴즈/시험)만은 여전히 회계사·가수
      // 전용 문제은행(api/_lib/examQuestions.ts)에 묶여 있어 별도로
      // 막혀 있다(api/character.ts의 EXAM_SUPPORTED_PROFESSIONS 참고).
      //
      // 주의: CHECK 제약식은 바인드 파라미터(sql 태그드 템플릿의 보통
      // `${}` 방식)를 쓸 수 없는 상수 표현식이어야 한다 — 그래서 아래
      // 50개 직업 ID는 변수 보간이 아니라 소스에 직접 적힌 리터럴
      // 텍스트다(src/data/characterProfessions.ts의 ProfessionId와
      // 정확히 같은 50개 값이어야 한다).
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS profession TEXT
          CHECK (profession IN (
            'accountant', 'singer', 'developer', 'designer', 'data-scientist', 'pm',
            'security-engineer', 'devops', 'game-developer', 'qa-engineer', 'lawyer',
            'tax-accountant', 'financial-analyst', 'patent-attorney', 'actuary',
            'consultant', 'realtor', 'doctor', 'nurse', 'pharmacist',
            'physical-therapist', 'dietitian', 'dentist', 'veterinarian', 'psychologist',
            'teacher', 'professor', 'researcher', 'librarian', 'translator', 'tutor',
            'curriculum-developer', 'linguist', 'actor', 'musician', 'writer',
            'illustrator', 'photographer', 'film-director', 'architect',
            'fashion-designer', 'chef', 'barista', 'flight-attendant', 'firefighter',
            'police-officer', 'civil-servant', 'social-worker', 'event-planner',
            'massage-therapist', 'custom'
          ))
      `
      // 이미 배포된 DB는 바로 위 ADD COLUMN IF NOT EXISTS가 아무 일도 하지
      // 않아서(컬럼이 이미 있으므로) 예전의 좁은(accountant/singer뿐인)
      // CHECK가 그대로 남아있다 — 그 제약을 지우고 50개짜리로 다시 건다.
      // 이름 없는 컬럼 CHECK에 PostgreSQL이 붙이는 기본 이름(<테이블>_
      // <컬럼>_check)에 의존한다 — 콜드스타트마다 실행돼도 몇 번이든
      // 같은 결과인 멱등 연산이라 안전하다.
      //
      // PR #65: 사용자가 직접 입력하는 자유 직업("숲해설가" 등)을 담을
      // sentinel 값 'custom'을 추가했다 — 기존 50개는 그대로 유지, 이
      // 51번째 값일 때만 아래 custom_profession_label 컬럼을 함께 쓴다.
      await sql`ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_profession_check`
      await sql`
        ALTER TABLE characters ADD CONSTRAINT characters_profession_check
          CHECK (profession IN (
            'accountant', 'singer', 'developer', 'designer', 'data-scientist', 'pm',
            'security-engineer', 'devops', 'game-developer', 'qa-engineer', 'lawyer',
            'tax-accountant', 'financial-analyst', 'patent-attorney', 'actuary',
            'consultant', 'realtor', 'doctor', 'nurse', 'pharmacist',
            'physical-therapist', 'dietitian', 'dentist', 'veterinarian', 'psychologist',
            'teacher', 'professor', 'researcher', 'librarian', 'translator', 'tutor',
            'curriculum-developer', 'linguist', 'actor', 'musician', 'writer',
            'illustrator', 'photographer', 'film-director', 'architect',
            'fashion-designer', 'chef', 'barista', 'flight-attendant', 'firefighter',
            'police-officer', 'civil-servant', 'social-worker', 'event-planner',
            'massage-therapist', 'custom'
          ))
      `

      // PR #65: profession='custom'일 때만 쓰는 사용자 입력 직업명(예:
      // "숲해설가"). nullable이라 기존 50개 직업 캐릭터는 항상 NULL —
      // 화면/동작에 아무 영향 없음. 다른 48개 CHECK 리터럴과 달리 자유
      // 텍스트라 애플리케이션 레벨(api/character.ts)에서 길이만 검증한다.
      await sql`ALTER TABLE characters ADD COLUMN IF NOT EXISTS custom_profession_label TEXT`

      // PR #65: 교육·장비 단계에 따라 0~100 사이에서 오르내리는 "집중력"
      // 게이지의 저장소. DEFAULT 90은 명령서가 정의한 "교육○·장비○"
      // 기본값 — 기존 캐릭터도 전부 이 값으로 백필되지만, 이 PR이 하는
      // 일은 조회 + 퀴즈/스스로 공부하기 결과에 따른 소폭 가감뿐이라
      // 기존 성장(exp/level) 로직과는 독립적이다.
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS focus_percent INTEGER
          NOT NULL DEFAULT 90 CHECK (focus_percent BETWEEN 0 AND 100)
      `

      // PR #45 checkpoint 4: level is a cached/denormalized value derived
      // from exp (api/_lib/characterGrowth.ts's levelForExp) — exp is the
      // real source of truth, level is recomputed and rewritten alongside
      // it every time exp changes (applyExpGain in api/character.ts), the
      // same "denormalize for read convenience, keep in sync on write"
      // choice the growth-system design doc made for `stage`. DEFAULT 1/0
      // backfills every existing character row with no data loss.
      await sql`ALTER TABLE characters ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1`
      await sql`ALTER TABLE characters ADD COLUMN IF NOT EXISTS exp INTEGER NOT NULL DEFAULT 0`

      // PR #63: 연령대 "진화" 게이트의 실제 저장소. NULL이면(모든 기존
      // 캐릭터 + 이 기능을 아직 한 번도 평가받지 않은 새 캐릭터) 예전처럼
      // character.level에서 그때그때 계산한 값을 그대로 쓴다(api/_lib/
      // characterMissions.ts의 effectiveAgeTier) — 이 컬럼이 존재한다는
      // 사실 자체는 기존 캐릭터의 화면/동작을 1바이트도 바꾸지 않는다.
      // maybeEvolveAgeTier가 처음으로 이 값을 써넣는 순간부터만(= 레벨은
      // 다음 단계에 닿았는데 이번 단계 6미션이 아직 안 끝났을 때) 그
      // 캐릭터는 레벨이 더 올라도 여기 고정된 값 밑으로 묶인다 — 이게
      // "레벨만으로는 못 넘어가는" 진짜 게이트다.
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS mission_unlocked_tier TEXT
          CHECK (mission_unlocked_tier IN ('toddler', 'teen', 'junior_20s', 'career_30s', 'veteran_40s', 'master_50s'))
      `

      // 지시서(8~9세 문제 유형 변경 및 종합 최종 시험/패스권 시스템):
      // toddler(8~9살)는 이제 6미션(직접입력3+객관식2+카드맞추기1)을
      // 채워도 바로 진화하지 않고, 그 6개를 바탕으로 생성한 "종합 최종
      // 시험"을 통과해야 한다(api/_lib/characterMissions.ts의
      // maybeEvolveAgeTier가 toddler→teen 전환에서만 이 값도 함께 본다).
      // final_exam_attempts는 1차 불합격에서 1, 2차 불합격(재시험도
      // 불합격)에서 2가 되고, 2가 되면 "처음부터 다시 키우기" 또는
      // "마켓에서 패스권 구매" 중 하나를 골라야만 더 진행할 수 있다.
      // final_exam_passed가 true가 되는 순간(시험 합격 또는 패스권 구매)
      // 그 즉시 teen으로 진화한다 — 둘 다 같은 플래그를 세팅하고 같은
      // maybeEvolveAgeTier 호출에 맡기므로 진화 로직 자체는 하나뿐이다.
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS final_exam_attempts SMALLINT NOT NULL DEFAULT 0
      `
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS final_exam_passed BOOLEAN NOT NULL DEFAULT false
      `
      // "처음부터 다시 키우기"의 저장소 — 기존 지식 기록(character_
      // knowledge_entries)을 실제로 DELETE하면 되돌릴 수 없어 위험하므로
      // (사용자 확인: "레벨/경험치/진행도만 리셋"), 대신 이 시각 이후에
      // 저장된 항목만 미션 진행도로 세는 소프트 리셋을 쓴다 —
      // getMissionProgress의 쿼리가 이 값을 함께 본다. NULL이면(모든
      // 기존 캐릭터) 지금까지와 동일하게 전부 센다.
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ
      `

      // 지시서(프로필 주소 기반 2.5D 동네 건물 짓기 시스템 구현): 온보딩
      // 화면(OpeningProfileScreen)이 모으기만 하고 어디에도 저장하지
      // 않던 "일하는/공부하는 지역"을, 이 건물 짓기 단계에서 처음으로
      // 실제 저장한다. building_built_at이 NULL이면(모든 기존 캐릭터
      // 포함) 아직 건물을 안 지은 것 — api/character.ts의 'complete-
      // building' 액션에서만 값을 채운다. 둘 다 nullable 추가 컬럼이라
      // 기존 캐릭터 행에는 아무 영향이 없다.
      await sql`ALTER TABLE characters ADD COLUMN IF NOT EXISTS address TEXT`
      await sql`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS building_built_at TIMESTAMPTZ
      `
    })().catch((err) => {
      characterTablesReady = null
      throw err
    })
  }
  return characterTablesReady
}

let knowledgeTableReady: Promise<unknown> | null = null

// One row per *confirmed* (user-approved, Gemini-verified as 'appropriate')
// piece of knowledge taught to a character — see api/character.ts's
// handleSaveKnowledge, the only place that ever inserts here. A rejected
// ('needs_revision'/'unverifiable') or never-confirmed verification result
// never gets a row at all, matching "검증이 끝났다는 이유만으로 자동
// 저장하지 않는다" and "검증 불가 상태에서는 검증된 지식으로 저장하지
// 않는다". `user_id` is denormalized alongside `character_id` (same
// deliberate choice as the growth-system design doc's 7절) so every query
// can filter on both without a join, and `profession` is captured as it
// was *at teaching time* — if the character's profession changes later
// (api/character.ts's PATCH), existing knowledge rows keep the job they
// were actually taught under instead of silently drifting.
export function ensureKnowledgeTable() {
  if (!knowledgeTableReady) {
    knowledgeTableReady = (async () => {
      await ensureCharacterTables()

      await sql`
        CREATE TABLE IF NOT EXISTS character_knowledge_entries (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          profession TEXT NOT NULL CHECK (profession IN (
            'accountant', 'singer', 'developer', 'designer', 'data-scientist', 'pm',
            'security-engineer', 'devops', 'game-developer', 'qa-engineer', 'lawyer',
            'tax-accountant', 'financial-analyst', 'patent-attorney', 'actuary',
            'consultant', 'realtor', 'doctor', 'nurse', 'pharmacist',
            'physical-therapist', 'dietitian', 'dentist', 'veterinarian', 'psychologist',
            'teacher', 'professor', 'researcher', 'librarian', 'translator', 'tutor',
            'curriculum-developer', 'linguist', 'actor', 'musician', 'writer',
            'illustrator', 'photographer', 'film-director', 'architect',
            'fashion-designer', 'chef', 'barista', 'flight-attendant', 'firefighter',
            'police-officer', 'civil-servant', 'social-worker', 'event-planner',
            'massage-therapist', 'custom'
          )),
          title TEXT NOT NULL,
          original_content TEXT NOT NULL,
          final_content TEXT NOT NULL,
          verification_status TEXT NOT NULL CHECK (verification_status IN ('appropriate', 'needs_revision', 'unverifiable')),
          verification_explanation TEXT NOT NULL,
          client_request_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS character_knowledge_entries_character_created_idx
          ON character_knowledge_entries (character_id, created_at DESC)
      `
      // PR #51(직업 선택 제한 해제): characters 테이블과 동일한 이유로,
      // 이미 배포된 DB에 남아있는 예전(accountant/singer뿐인) CHECK를
      // 지우고 50개짜리로 다시 건다 — 자세한 설명은 ensureCharacterTables
      // 위쪽 주석 참고.
      await sql`ALTER TABLE character_knowledge_entries DROP CONSTRAINT IF EXISTS character_knowledge_entries_profession_check`
      await sql`
        ALTER TABLE character_knowledge_entries ADD CONSTRAINT character_knowledge_entries_profession_check
          CHECK (profession IN (
            'accountant', 'singer', 'developer', 'designer', 'data-scientist', 'pm',
            'security-engineer', 'devops', 'game-developer', 'qa-engineer', 'lawyer',
            'tax-accountant', 'financial-analyst', 'patent-attorney', 'actuary',
            'consultant', 'realtor', 'doctor', 'nurse', 'pharmacist',
            'physical-therapist', 'dietitian', 'dentist', 'veterinarian', 'psychologist',
            'teacher', 'professor', 'researcher', 'librarian', 'translator', 'tutor',
            'curriculum-developer', 'linguist', 'actor', 'musician', 'writer',
            'illustrator', 'photographer', 'film-director', 'architect',
            'fashion-designer', 'chef', 'barista', 'flight-attendant', 'firefighter',
            'police-officer', 'civil-servant', 'social-worker', 'event-planner',
            'massage-therapist', 'custom'
          ))
      `

      // PR #65: characters.custom_profession_label과 동일한 이유 —
      // profession='custom'으로 저장된 지식 카드가 "저장 당시 직업명"을
      // 그대로 보존한다(캐릭터의 직업이 나중에 바뀌어도 이 행은 그대로).
      await sql`ALTER TABLE character_knowledge_entries ADD COLUMN IF NOT EXISTS custom_profession_label TEXT`

      // PR #65: 지식 카드 10종 분류(직업기초지식/전문정보/실무경험/개인
      // 노하우/숙련기술/실전문제해결사례/직업관련팁/실패경험과교훈/
      // 교육훈련경험/인생경험과가치관) — PR #63의 mission_type(입력
      // 방식: 선택지/AI추천/직접입력)과는 독립된 축이다. nullable이라
      // 기존 행은 전부 NULL로 중립.
      await sql`
        ALTER TABLE character_knowledge_entries ADD COLUMN IF NOT EXISTS knowledge_category TEXT
          CHECK (knowledge_category IN (
            'basic_knowledge', 'expert_info', 'hands_on_experience', 'personal_knowhow',
            'skilled_technique', 'problem_solving_case', 'job_tip', 'failure_lesson',
            'training_experience', 'life_experience'
          ))
      `
      // Lets the client tag a save request with its own idempotency key —
      // handleSaveKnowledge uses this to detect "this exact save was
      // already processed" (double-click, retried request) and return the
      // existing row instead of inserting a duplicate — same mechanism as
      // messages.client_request_id in dailyLimit.ts.
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS character_knowledge_entries_character_request_idx
          ON character_knowledge_entries (character_id, client_request_id)
          WHERE client_request_id IS NOT NULL
      `

      // PR #45 checkpoint 3: distinguishes a user-taught entry from one the
      // character generated and verified itself ("스스로 공부하기").
      // Nullable-safe additive column — DEFAULT 'user_taught' means every
      // existing row (all of which were in fact user-taught, from PR #44)
      // is correctly backfilled with no data loss, and no write path needs
      // updating just because this column now exists.
      await sql`
        ALTER TABLE character_knowledge_entries ADD COLUMN IF NOT EXISTS source TEXT
          NOT NULL DEFAULT 'user_taught' CHECK (source IN ('user_taught', 'ai_generated'))
      `

      // PR #63: 6단계 카드형 미션(객관식/주관식/노하우) 시스템 — 이 저장이
      // 어느 미션 슬롯을 채웠는지, 그리고 저장 당시 캐릭터가 어느
      // 연령대였는지를 스냅샷한다. 둘 다 nullable이라 기존 행(이 PR 이전에
      // 저장된 모든 지식)은 NULL로 남고, 아래 미션 집계 쿼리는 항상
      // `age_tier_at_save = 특정 티어`로 비교하므로 NULL 행은 어느 집계에도
      // 걸리지 않는다 — 기존 사용자가 이미 쌓아둔 기록이 새 게이트를
      // 공짜로 통과시켜주지도, 거꾸로 막아버리지도 않는다(완전히 중립).
      // profession 컬럼과 동일한 "저장 당시 값을 그대로 박아둔다"는 원칙.
      await sql`
        ALTER TABLE character_knowledge_entries ADD COLUMN IF NOT EXISTS mission_type TEXT
          CHECK (mission_type IN ('objective', 'subjective', 'knowhow'))
      `
      // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 이미 배포된 DB는 바로
      // 위 ADD COLUMN IF NOT EXISTS가 아무 일도 하지 않아서 예전의 3종
      // CHECK가 그대로 남는다 — characters_profession_check와 같은 방식
      // (이름 없는 CHECK의 기본 이름에 의존)으로 그 제약을 지우고
      // 'card_game'을 포함한 4종으로 다시 건다.
      await sql`ALTER TABLE character_knowledge_entries DROP CONSTRAINT IF EXISTS character_knowledge_entries_mission_type_check`
      // 지시서(8세 학습 시스템: 8문제 커리큘럼): toddler(8~9살)용 신유형
      // 미니게임 2종(순서 맞추기/분류하기)을 card_game과 같은 "완료
      // 확인형" 미션으로 추가한다 — 같은 이유(이미 배포된 DB의 기존
      // CHECK를 덮어써야 함)로 또 한 번 drop 후 6종으로 다시 건다.
      await sql`
        ALTER TABLE character_knowledge_entries ADD CONSTRAINT character_knowledge_entries_mission_type_check
          CHECK (mission_type IN ('objective', 'subjective', 'knowhow', 'card_game', 'sequence_order', 'categorize'))
      `
      await sql`
        ALTER TABLE character_knowledge_entries ADD COLUMN IF NOT EXISTS age_tier_at_save TEXT
          CHECK (age_tier_at_save IN ('toddler', 'teen', 'junior_20s', 'career_30s', 'veteran_40s', 'master_50s'))
      `
    })().catch((err) => {
      knowledgeTableReady = null
      throw err
    })
  }
  return knowledgeTableReady
}

let characterMessagesTableReady: Promise<unknown> | null = null

// PR #45 checkpoint 3.6: one row per line shown in a character's
// InteractionPanel dialogue feed (가르치기/스스로 공부하기) — unlike
// character_knowledge_entries, this logs *every* exchange, including a
// 'needs_revision'/'unverifiable' attempt that never becomes a saved
// knowledge entry, so nothing the user sees in the conversation
// disappears on refresh. It is a *conversation log*, not a knowledge
// base: `character_knowledge_entries` alone remains the only source of
// "검증된 지식" a future exam/chat feature may treat as fact (see
// resolveTeachReply/handleSaveKnowledge in api/character.ts — a
// needs_revision/unverifiable row here never gets a knowledge_entry_id).
// user_id is denormalized alongside character_id for the same reason as
// character_knowledge_entries (db.ts:208-213) — every query filters on
// both directly.
export function ensureCharacterMessagesTable() {
  if (!characterMessagesTableReady) {
    characterMessagesTableReady = (async () => {
      // character_messages.knowledge_entry_id references
      // character_knowledge_entries(id), so that table must exist first.
      await ensureKnowledgeTable()

      await sql`
        CREATE TABLE IF NOT EXISTS character_messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          speaker TEXT NOT NULL CHECK (speaker IN ('user', 'character')),
          source TEXT NOT NULL CHECK (source IN ('user_taught', 'ai_generated')),
          content TEXT NOT NULL,
          verification_status TEXT CHECK (verification_status IN ('appropriate', 'needs_revision', 'unverifiable')),
          knowledge_entry_id INTEGER REFERENCES character_knowledge_entries(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS character_messages_character_created_idx
          ON character_messages (character_id, created_at ASC)
      `
    })().catch((err) => {
      characterMessagesTableReady = null
      throw err
    })
  }
  return characterMessagesTableReady
}

let growthTablesReady: Promise<unknown> | null = null

// PR #45 checkpoint 4: 퀴즈·시험 응시 기록(전체 이력, 감사/조회용) +
// "최초 1회" 보상 여부를 원자적으로 판정하는 두 개의 작은 테이블.
//
// character_exam_attempts는 모든 시도를 남기는 append-only 로그다(정답
// 여부·점수·실제로 지급된 XP 포함) — 재시도해도 몇 번이든 쌓이지만,
// exp_awarded는 아래 두 "최초" 테이블에 실제로 새 행이 들어갔을 때만
// 0보다 크다.
//
// character_quiz_firsts/character_exam_firsts는 PRIMARY KEY 자체가
// "이미 보상을 받았는지"의 유일한 판단 기준이다 — `INSERT ... ON
// CONFLICT DO NOTHING RETURNING ...`으로 한 문장에서 원자적으로
// "이번이 처음이다/아니다"를 판정하므로(reserveTeach 등과 같은 원자적
// 패턴), 동시에 두 요청이 들어와도 XP가 두 번 지급될 수 없다.
export function ensureGrowthTables() {
  if (!growthTablesReady) {
    growthTablesReady = (async () => {
      await ensureCharacterTables()

      await sql`
        CREATE TABLE IF NOT EXISTS character_exam_attempts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('quiz', 'exam')),
          profession TEXT NOT NULL CHECK (profession IN ('accountant', 'singer')),
          question_id TEXT,
          score INTEGER,
          passed BOOLEAN NOT NULL,
          exp_awarded INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS character_exam_attempts_character_created_idx
          ON character_exam_attempts (character_id, created_at DESC)
      `

      await sql`
        CREATE TABLE IF NOT EXISTS character_quiz_firsts (
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (character_id, question_id)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS character_exam_firsts (
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          profession TEXT NOT NULL CHECK (profession IN ('accountant', 'singer')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (character_id, profession)
        )
      `
    })().catch((err) => {
      growthTablesReady = null
      throw err
    })
  }
  return growthTablesReady
}

let personalKnowledgeLogTablesReady: Promise<unknown> | null = null

// 지시서(실제 업무·연구·비법·노하우 기록 시스템): 유저 본인이 직접 쓰는
// "지식 기록장" — AI 캐릭터(누리/두리)를 가르치는 character_knowledge_
// entries와는 완전히 다른 테이블이다. 그쪽은 character_id로 캐릭터에
// 묶이지만, 이 기록은 캐릭터와 무관하게 user_id로만 묶인 유저 개인
// 자산이다(지시서 4번: "유저별로 분리된 DB에 저장"). 사진/동영상은
// message_attachments와 같은 원칙(파일 자체는 Postgres에 안 두고 Vercel
// Blob URL만 저장)으로 별도 1:N 테이블에 둔다.
export function ensurePersonalKnowledgeLogTables() {
  if (!personalKnowledgeLogTablesReady) {
    personalKnowledgeLogTablesReady = (async () => {
      await ensureUsersTable()
      await sql`
        CREATE TABLE IF NOT EXISTS personal_knowledge_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          entry_date DATE NOT NULL,
          business_name TEXT,
          category TEXT NOT NULL CHECK (category IN ('work_log', 'research_note', 'success_case', 'failure_case', 'tip')),
          tags TEXT,
          content TEXT NOT NULL,
          visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'partial', 'public')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS personal_knowledge_logs_user_id_created_idx
          ON personal_knowledge_logs (user_id, created_at DESC)
      `
      await sql`
        CREATE TABLE IF NOT EXISTS personal_knowledge_log_attachments (
          id SERIAL PRIMARY KEY,
          log_id INTEGER NOT NULL REFERENCES personal_knowledge_logs(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          url TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS personal_knowledge_log_attachments_log_id_position_idx
          ON personal_knowledge_log_attachments (log_id, position)
      `
    })().catch((err) => {
      personalKnowledgeLogTablesReady = null
      throw err
    })
  }
  return personalKnowledgeLogTablesReady
}

export interface PersonalKnowledgeLogRow {
  id: number
  user_id: number
  entry_date: string
  business_name: string | null
  category: 'work_log' | 'research_note' | 'success_case' | 'failure_case' | 'tip'
  tags: string | null
  content: string
  visibility: 'private' | 'partial' | 'public'
  created_at: string
  updated_at: string
}

export interface PersonalKnowledgeLogAttachmentRow {
  id: number
  log_id: number
  position: number
  url: string
  mime_type: string
  name: string | null
  created_at: string
}

export { sql }

export interface UserRow {
  id: number
  email: string
  password_hash: string
  created_at: string
  token_version: number
}

export interface PasswordResetTokenRow {
  id: number
  user_id: number
  token_hash: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface ConversationRow {
  id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: number
  conversation_id: number
  role: 'user' | 'ai'
  ai_provider: string | null
  content: string
  is_error: boolean
  created_at: string
  // Legacy single-attachment columns — see the migration note in
  // ensureConversationsTables. New code reads attachments from
  // MessageAttachmentRow / message_attachments instead.
  attachment_url: string | null
  attachment_mime_type: string | null
  attachment_name: string | null
}

export interface MessageAttachmentRow {
  message_id: number
  position: number
  url: string
  mime_type: string | null
  name: string | null
}

// PR #51(직업 선택 제한 해제): characters.profession/character_knowledge_entries
// .profession이 저장할 수 있는 50개 직업 — src/data/characterProfessions.ts
// 의 ProfessionId와 정확히 같은 값이어야 한다(별도 파일이라 타입을 직접
// 공유하지는 않지만, 이 저장소의 기존 api//src 중복 패턴과 동일). 퀴즈/
// 시험 관련 행(character_exam_attempts/character_exam_firsts)은 여전히
// 'accountant' | 'singer'로 좁게 남겨둔다 — 그 기능은 지금도 이 2개
// 직업뿐이라서(EXAM_SUPPORTED_PROFESSIONS 참고).
// PR #65: 'custom'은 사용자가 직접 입력한 자유 직업(예: "숲해설가")의
// sentinel 값 — 이때만 CharacterRow.custom_profession_label /
// KnowledgeEntryRow.custom_profession_label에 실제 입력 텍스트가 들어간다.
export type ProfessionId =
  | 'accountant' | 'singer' | 'developer' | 'designer' | 'data-scientist' | 'pm'
  | 'security-engineer' | 'devops' | 'game-developer' | 'qa-engineer' | 'lawyer'
  | 'tax-accountant' | 'financial-analyst' | 'patent-attorney' | 'actuary'
  | 'consultant' | 'realtor' | 'doctor' | 'nurse' | 'pharmacist'
  | 'physical-therapist' | 'dietitian' | 'dentist' | 'veterinarian' | 'psychologist'
  | 'teacher' | 'professor' | 'researcher' | 'librarian' | 'translator' | 'tutor'
  | 'curriculum-developer' | 'linguist' | 'actor' | 'musician' | 'writer'
  | 'illustrator' | 'photographer' | 'film-director' | 'architect'
  | 'fashion-designer' | 'chef' | 'barista' | 'flight-attendant' | 'firefighter'
  | 'police-officer' | 'civil-servant' | 'social-worker' | 'event-planner'
  | 'massage-therapist' | 'custom'

// PR #65: 지식 카드 10종 분류 — src/data/knowledgeCategories.ts의
// KnowledgeCategory와 반드시 같은 값이어야 한다(이 파일의 기존 관례).
export type KnowledgeCategory =
  | 'basic_knowledge' | 'expert_info' | 'hands_on_experience' | 'personal_knowhow'
  | 'skilled_technique' | 'problem_solving_case' | 'job_tip' | 'failure_lesson'
  | 'training_experience' | 'life_experience'

// PR #63: characters.mission_unlocked_tier / character_knowledge_entries
// .age_tier_at_save가 쓰는 6단계 연령대 — api/_lib/characterAge.ts의
// AgeTier와 반드시 같은 값이어야 한다(그 파일을 import하지 않는 이유는
// ProfessionId와 같은 이 파일의 기존 "행 타입은 여기서 직접 리터럴로
// 적는다" 관례를 따른 것).
type AgeTierValue = 'toddler' | 'teen' | 'junior_20s' | 'career_30s' | 'veteran_40s' | 'master_50s'

export interface CharacterRow {
  id: number
  user_id: number
  companion_type: 'nuri' | 'duri'
  stage: 'child' | 'adult'
  profession: ProfessionId | null
  custom_profession_label: string | null
  level: number
  exp: number
  mission_unlocked_tier: AgeTierValue | null
  focus_percent: number
  final_exam_attempts: number
  final_exam_passed: boolean
  reset_at: string | null
  address: string | null
  building_built_at: string | null
  created_at: string
}

export interface KnowledgeEntryRow {
  id: number
  user_id: number
  character_id: number
  profession: ProfessionId
  custom_profession_label: string | null
  title: string
  original_content: string
  final_content: string
  verification_status: 'appropriate' | 'needs_revision' | 'unverifiable'
  verification_explanation: string
  source: 'user_taught' | 'ai_generated'
  mission_type: 'objective' | 'subjective' | 'knowhow' | null
  age_tier_at_save: AgeTierValue | null
  knowledge_category: KnowledgeCategory | null
  created_at: string
}

export interface CharacterMessageRow {
  id: number
  user_id: number
  character_id: number
  speaker: 'user' | 'character'
  source: 'user_taught' | 'ai_generated'
  content: string
  verification_status: 'appropriate' | 'needs_revision' | 'unverifiable' | null
  knowledge_entry_id: number | null
  created_at: string
}

export interface CharacterExamAttemptRow {
  id: number
  user_id: number
  character_id: number
  kind: 'quiz' | 'exam'
  profession: 'accountant' | 'singer'
  question_id: string | null
  score: number | null
  passed: boolean
  exp_awarded: number
  created_at: string
}
