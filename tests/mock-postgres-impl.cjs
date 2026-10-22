// In-memory simulation of the specific SQL statements the API handlers
// under test issue via @vercel/postgres's `sql` tagged template. Matches on
// distinctive substrings of the joined template text (not exact whitespace)
// so it isn't fragile to how a query's literal segments happen to wrap.
//
// This verifies that our TypeScript call sites + SQL text produce the
// right *results* for each statement we recognize, under Postgres's
// documented behavior (e.g. atomic conditional "ON CONFLICT ... DO UPDATE
// ... WHERE ..."). It does not exercise real Postgres itself — see
// tests/README.md.

const state = {
  users: new Map(), // id -> { id, email, password_hash, token_version }
  usersByEmail: new Map(), // email -> id
  conversations: new Map(), // id -> { id, user_id, title }
  messages: [], // { id, conversation_id, role, content, ai_provider, is_error, client_request_id }
  attachments: [], // { message_id, position, url, mime_type, name }
  dailyUsage: new Map(), // `${userId}|${date}` -> { used_count }
  teachUsage: new Map(), // `${userId}|${date}` -> { used_count }
  studyUsage: new Map(), // `${userId}|${date}` -> { used_count }
  passwordResetTokens: [], // { id, user_id, token_hash, expires_at, used_at }
  characters: [], // { id, user_id, companion_type, stage }
  knowledgeEntries: [], // { id, user_id, character_id, profession, title, original_content, final_content, verification_status, verification_explanation, client_request_id, source }
  characterMessages: [], // { id, user_id, character_id, speaker, source, content, verification_status, knowledge_entry_id }
  nextCharacterMessageId: 1,
  examAttempts: [], // { id, user_id, character_id, kind, profession, question_id, score, passed, exp_awarded }
  nextExamAttemptId: 1,
  quizFirsts: new Set(), // `${characterId}|${questionId}`
  examFirsts: new Set(), // `${characterId}|${profession}`
  nextKnowledgeEntryId: 1,
  nextCharacterId: 1,
  nextUserId: 1,
  nextMessageId: 1,
  nextConversationId: 1,
  nextTokenId: 1,
  fakeDateKST: '2026-01-01',
  calls: [],
}

function seedUser(id, { email = `u${id}@test.com`, tokenVersion = 0, passwordHash = null } = {}) {
  state.users.set(id, { id, email, password_hash: passwordHash, token_version: tokenVersion })
  state.usersByEmail.set(email, id)
  if (id >= state.nextUserId) state.nextUserId = id + 1
}
function seedConversation(id, userId, title = 'test') {
  state.conversations.set(id, { id, user_id: userId, title })
  if (id >= state.nextConversationId) state.nextConversationId = id + 1
}
function setFakeDate(d) {
  state.fakeDateKST = d
}
function reset() {
  state.users.clear()
  state.usersByEmail.clear()
  state.conversations.clear()
  state.messages = []
  state.attachments = []
  state.dailyUsage.clear()
  state.teachUsage.clear()
  state.studyUsage.clear()
  state.passwordResetTokens = []
  state.characters = []
  state.knowledgeEntries = []
  state.characterMessages = []
  state.nextCharacterMessageId = 1
  state.examAttempts = []
  state.nextExamAttemptId = 1
  state.quizFirsts.clear()
  state.examFirsts.clear()
  state.nextKnowledgeEntryId = 1
  state.nextCharacterId = 1
  state.nextUserId = 1
  state.nextMessageId = 1
  state.nextConversationId = 1
  state.nextTokenId = 1
  state.fakeDateKST = '2026-01-01'
  state.calls = []
}

function has(text, ...needles) {
  return needles.every((n) => text.includes(n))
}

function sql(strings, ...values) {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim()
  state.calls.push(text.slice(0, 90))

  if (has(text, 'CREATE TABLE') || has(text, 'ALTER TABLE') || has(text, 'CREATE INDEX') || has(text, 'CREATE UNIQUE INDEX')) {
    return Promise.resolve({ rows: [] })
  }

  // --- auth.ts: token_version lookup ---
  if (has(text, 'SELECT token_version FROM users')) {
    const u = state.users.get(values[0])
    return Promise.resolve({ rows: u ? [{ token_version: u.token_version }] : [] })
  }

  // --- login.ts ---
  if (has(text, 'SELECT id, email, password_hash, token_version FROM users')) {
    const id = state.usersByEmail.get(values[0])
    const u = id != null ? state.users.get(id) : undefined
    return Promise.resolve({ rows: u ? [{ ...u }] : [] })
  }

  // --- signup.ts: existence check ---
  if (has(text, 'SELECT id FROM users WHERE email')) {
    const id = state.usersByEmail.get(values[0])
    return Promise.resolve({ rows: id != null ? [{ id }] : [] })
  }

  // --- signup.ts: insert ---
  if (has(text, 'INSERT INTO users')) {
    const [email, passwordHash] = values
    const id = state.nextUserId++
    const user = { id, email, password_hash: passwordHash, token_version: 0 }
    state.users.set(id, user)
    state.usersByEmail.set(email, id)
    return Promise.resolve({ rows: [{ id, email, token_version: 0 }] })
  }

  // --- dailyLimit.ts: reserve (atomic conditional upsert) ---
  if (has(text, 'INSERT INTO daily_question_usage')) {
    const [userId, limit] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.dailyUsage.get(key)
    if (!row) {
      state.dailyUsage.set(key, { used_count: 1 })
      return Promise.resolve({ rows: [{ used_count: 1 }] })
    }
    if (row.used_count < limit) {
      row.used_count += 1
      return Promise.resolve({ rows: [{ used_count: row.used_count }] })
    }
    return Promise.resolve({ rows: [] })
  }

  // --- dailyLimit.ts: refund ---
  if (has(text, 'UPDATE daily_question_usage')) {
    const [userId] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.dailyUsage.get(key)
    if (row && row.used_count > 0) row.used_count -= 1
    return Promise.resolve({ rows: [] })
  }

  // --- dailyLimit.ts: read-only remaining ---
  if (has(text, 'SELECT used_count FROM daily_question_usage')) {
    const [userId] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.dailyUsage.get(key)
    return Promise.resolve({ rows: row ? [{ used_count: row.used_count }] : [] })
  }

  // --- conversations: create ---
  if (has(text, 'INSERT INTO conversations')) {
    const [userId, title] = values
    const id = state.nextConversationId++
    const now = new Date().toISOString()
    state.conversations.set(id, { id, user_id: userId, title })
    return Promise.resolve({ rows: [{ id, title, created_at: now, updated_at: now }] })
  }

  // --- conversations: list ---
  if (has(text, 'SELECT id, title, updated_at') && has(text, 'FROM conversations')) {
    const [userId] = values
    const now = new Date().toISOString()
    const rows = [...state.conversations.values()]
      .filter((c) => c.user_id === userId)
      .map((c) => ({ id: c.id, title: c.title, updated_at: now }))
    return Promise.resolve({ rows })
  }

  // --- conversations: handleGet's fuller row ---
  if (has(text, 'SELECT id, title, created_at, updated_at FROM conversations')) {
    const [id, userId] = values
    const c = state.conversations.get(id)
    const now = new Date().toISOString()
    return Promise.resolve({
      rows: c && c.user_id === userId ? [{ id: c.id, title: c.title, created_at: now, updated_at: now }] : [],
    })
  }

  // --- conversations: ownership check (handlePost/handleRetry/handleDelete) ---
  if (has(text, 'SELECT id FROM conversations')) {
    const [id, userId] = values
    const c = state.conversations.get(id)
    return Promise.resolve({ rows: c && c.user_id === userId ? [{ id }] : [] })
  }

  // --- conversations: delete (scoped to owner) ---
  if (has(text, 'DELETE FROM conversations')) {
    const [id, userId] = values
    const c = state.conversations.get(id)
    if (c && c.user_id === userId) {
      state.conversations.delete(id)
      return Promise.resolve({ rows: [{ id }] })
    }
    return Promise.resolve({ rows: [] })
  }

  // --- findReplay (password-reset-style idempotency; reused shape) ---
  if (has(text, 'SELECT id, content FROM messages') && has(text, 'client_request_id')) {
    const [convId, requestId] = values
    const m = state.messages.find(
      (m) => m.conversation_id === convId && m.client_request_id === requestId && m.role === 'user',
    )
    return Promise.resolve({ rows: m ? [{ id: m.id, content: m.content }] : [] })
  }

  if (has(text, 'SELECT content, ai_provider, is_error FROM messages')) {
    const [convId, afterId] = values
    const m = state.messages.find((m) => m.conversation_id === convId && m.role === 'ai' && m.id > afterId)
    return Promise.resolve({
      rows: m ? [{ content: m.content, ai_provider: m.ai_provider, is_error: m.is_error }] : [],
    })
  }

  if (has(text, 'SELECT message_id, position, url, mime_type, name FROM message_attachments')) {
    const [messageId] = values
    const rows = state.attachments
      .filter((a) => a.message_id === messageId)
      .sort((a, b) => a.position - b.position)
    return Promise.resolve({ rows })
  }

  if (has(text, 'SELECT role, content FROM', 'NOT IN')) {
    const [convId] = values
    const excludeIds = new Set(values.slice(1))
    const rows = state.messages
      .filter((m) => m.conversation_id === convId && !excludeIds.has(m.id))
      .map((m) => ({ role: m.role, content: m.content }))
    return Promise.resolve({ rows })
  }

  if (has(text, 'SELECT role, content FROM')) {
    const [convId] = values
    const rows = state.messages
      .filter((m) => m.conversation_id === convId)
      .map((m) => ({ role: m.role, content: m.content }))
    return Promise.resolve({ rows })
  }

  if (has(text, 'INSERT INTO messages', 'client_request_id') && has(text, 'VALUES') && !has(text, 'ai_provider')) {
    const [convId, content, requestId] = values
    const id = state.nextMessageId++
    state.messages.push({
      id,
      conversation_id: convId,
      role: 'user',
      content,
      ai_provider: null,
      is_error: false,
      client_request_id: requestId,
    })
    return Promise.resolve({ rows: [{ id }] })
  }

  if (has(text, 'INSERT INTO messages', 'role, content)')) {
    const [convId, content] = values
    const id = state.nextMessageId++
    state.messages.push({
      id,
      conversation_id: convId,
      role: 'user',
      content,
      ai_provider: null,
      is_error: false,
      client_request_id: null,
    })
    return Promise.resolve({ rows: [{ id }] })
  }

  if (has(text, 'INSERT INTO message_attachments')) {
    const [messageId, position, url, mimeType, name] = values
    state.attachments.push({ message_id: messageId, position, url, mime_type: mimeType, name })
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'INSERT INTO messages', 'ai_provider')) {
    const [convId, content, isError] = values
    const id = state.nextMessageId++
    state.messages.push({
      id,
      conversation_id: convId,
      role: 'ai',
      content,
      ai_provider: 'Gemini',
      is_error: isError,
      client_request_id: null,
    })
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'UPDATE conversations SET updated_at')) {
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'SELECT * FROM messages')) {
    const [convId] = values
    const rows = state.messages
      .filter((m) => m.conversation_id === convId)
      .slice()
      .reverse()
      .slice(0, 2)
      .map((m) => ({ ...m, created_at: new Date().toISOString() }))
    return Promise.resolve({ rows })
  }

  if (has(text, 'UPDATE messages SET content')) {
    const [content, isError, id] = values
    const m = state.messages.find((m) => m.id === id)
    if (m) {
      m.content = content
      m.is_error = isError
    }
    return Promise.resolve({ rows: [] })
  }

  // --- conversations/[id].ts handleGet: messages LEFT JOIN attachments ---
  if (has(text, 'SELECT m.id AS message_id')) {
    const [convId] = values
    const rows = []
    for (const m of state.messages.filter((m) => m.conversation_id === convId)) {
      const atts = state.attachments.filter((a) => a.message_id === m.id).sort((a, b) => a.position - b.position)
      if (atts.length === 0) {
        rows.push({
          message_id: m.id,
          role: m.role,
          content: m.content,
          ai_provider: m.ai_provider,
          is_error: m.is_error,
          attachment_url: null,
          attachment_mime_type: null,
          attachment_name: null,
        })
      } else {
        for (const a of atts) {
          rows.push({
            message_id: m.id,
            role: m.role,
            content: m.content,
            ai_provider: m.ai_provider,
            is_error: m.is_error,
            attachment_url: a.url,
            attachment_mime_type: a.mime_type,
            attachment_name: a.name,
          })
        }
      }
    }
    return Promise.resolve({ rows })
  }

  // --- password-reset.ts: request action ---
  if (has(text, 'SELECT id, email FROM users WHERE email')) {
    const id = state.usersByEmail.get(values[0])
    const u = id != null ? state.users.get(id) : undefined
    return Promise.resolve({ rows: u ? [{ id: u.id, email: u.email }] : [] })
  }

  if (has(text, 'SELECT created_at FROM password_reset_tokens')) {
    const [userId] = values
    const rows = state.passwordResetTokens
      .filter((t) => t.user_id === userId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 1)
      .map((t) => ({ created_at: new Date(t.created_at).toISOString() }))
    return Promise.resolve({ rows })
  }

  if (has(text, 'UPDATE password_reset_tokens SET used_at', 'user_id', 'used_at IS NULL')) {
    const [userId] = values
    for (const t of state.passwordResetTokens) {
      if (t.user_id === userId && t.used_at === null) t.used_at = Date.now()
    }
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'INSERT INTO password_reset_tokens')) {
    const [userId, tokenHash, expiresAt] = values
    const id = state.nextTokenId++
    state.passwordResetTokens.push({
      id,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(expiresAt).getTime(),
      used_at: null,
      created_at: Date.now(),
    })
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens')) {
    const [tokenHash] = values
    const row = state.passwordResetTokens.find((t) => t.token_hash === tokenHash)
    return Promise.resolve({
      rows: row
        ? [
            {
              id: row.id,
              user_id: row.user_id,
              expires_at: new Date(row.expires_at).toISOString(),
              used_at: row.used_at === null ? null : new Date(row.used_at).toISOString(),
            },
          ]
        : [],
    })
  }

  if (has(text, 'UPDATE password_reset_tokens SET used_at', 'WHERE id')) {
    const [tokenId] = values
    const row = state.passwordResetTokens.find((t) => t.id === tokenId)
    if (row) row.used_at = Date.now()
    return Promise.resolve({ rows: [] })
  }

  if (has(text, 'UPDATE users SET password_hash')) {
    const [passwordHash, userId] = values
    const u = state.users.get(userId)
    if (u) {
      u.password_hash = passwordHash
      u.token_version += 1
    }
    return Promise.resolve({ rows: [] })
  }

  // --- api/character.ts: applyExpGain's exp update (checked before the
  // generic 'UPDATE characters' profession matcher below, since both start
  // with "UPDATE characters" but have completely different bound params) ---
  if (has(text, 'UPDATE characters', 'SET exp = exp +')) {
    const [delta, characterId, userId] = values
    const row = state.characters.find((c) => c.id === characterId && c.user_id === userId)
    if (!row) return Promise.resolve({ rows: [] })
    row.exp = (row.exp ?? 0) + delta
    return Promise.resolve({ rows: [{ exp: row.exp }] })
  }

  // --- api/character.ts: applyExpGain's level update ---
  if (has(text, 'UPDATE characters', 'SET level =')) {
    const [newLevel, characterId, userId] = values
    const row = state.characters.find((c) => c.id === characterId && c.user_id === userId)
    if (row) row.level = newLevel
    return Promise.resolve({ rows: [] })
  }

  // --- api/character.ts: change/set profession (checked before the
  // generic 'FROM characters' list matcher below, since this statement has
  // no FROM clause at all) ---
  if (has(text, 'UPDATE characters')) {
    const [profession, userId, companionType] = values
    const row = state.characters.find((c) => c.user_id === userId && c.companion_type === companionType)
    if (!row) return Promise.resolve({ rows: [] })
    row.profession = profession
    const now = new Date().toISOString()
    return Promise.resolve({
      rows: [
        {
          id: row.id,
          user_id: row.user_id,
          companion_type: row.companion_type,
          stage: row.stage,
          profession: row.profession,
          level: row.level ?? 1,
          exp: row.exp ?? 0,
          created_at: now,
        },
      ],
    })
  }

  // --- api/character.ts: findOwnCharacter (verify/save/list-knowledge's
  // shared ownership lookup) — checked before the generic 'FROM characters'
  // list matcher below, since that one only filters by user_id and would
  // otherwise return the wrong character when a user has both 누리 and 두리.
  if (has(text, 'FROM characters', 'companion_type =')) {
    const [userId, companionType] = values
    const row = state.characters.find((c) => c.user_id === userId && c.companion_type === companionType)
    const now = new Date().toISOString()
    return Promise.resolve({
      rows: row
        ? [
            {
              id: row.id,
              user_id: row.user_id,
              companion_type: row.companion_type,
              stage: row.stage,
              profession: row.profession,
              level: row.level ?? 1,
              exp: row.exp ?? 0,
              created_at: now,
            },
          ]
        : [],
    })
  }

  // --- api/character.ts: list ---
  if (has(text, 'FROM characters')) {
    const [userId] = values
    const now = new Date().toISOString()
    const rows = state.characters
      .filter((c) => c.user_id === userId)
      .map((c) => ({
        id: c.id,
        user_id: c.user_id,
        companion_type: c.companion_type,
        stage: c.stage,
        profession: c.profession,
        level: c.level ?? 1,
        exp: c.exp ?? 0,
        created_at: now,
      }))
    return Promise.resolve({ rows })
  }

  // --- api/character.ts: create (ON CONFLICT DO NOTHING) ---
  // 'child' is a literal in the real query (api/character.ts never takes a
  // client-sent stage), not a bound parameter, so it's not in `values`.
  if (has(text, 'INSERT INTO characters')) {
    const [userId, companionType] = values
    const stage = 'child'
    const exists = state.characters.some((c) => c.user_id === userId && c.companion_type === companionType)
    if (exists) return Promise.resolve({ rows: [] })
    const id = state.nextCharacterId++
    const now = new Date().toISOString()
    state.characters.push({ id, user_id: userId, companion_type: companionType, stage, profession: null, level: 1, exp: 0 })
    return Promise.resolve({
      rows: [{ id, user_id: userId, companion_type: companionType, stage, profession: null, level: 1, exp: 0, created_at: now }],
    })
  }

  // --- api/_lib/knowledgeLimit.ts: reserveTeach (atomic conditional upsert,
  // same shape as daily_question_usage above but a fully separate table) ---
  if (has(text, 'INSERT INTO daily_teach_usage')) {
    const [userId, limit] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.teachUsage.get(key)
    if (!row) {
      state.teachUsage.set(key, { used_count: 1 })
      return Promise.resolve({ rows: [{ used_count: 1 }] })
    }
    if (row.used_count < limit) {
      row.used_count += 1
      return Promise.resolve({ rows: [{ used_count: row.used_count }] })
    }
    return Promise.resolve({ rows: [] })
  }

  // --- api/_lib/knowledgeLimit.ts: refundTeach ---
  if (has(text, 'UPDATE daily_teach_usage')) {
    const [userId] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.teachUsage.get(key)
    if (row && row.used_count > 0) row.used_count -= 1
    return Promise.resolve({ rows: [] })
  }

  // --- api/_lib/studyLimit.ts: reserveStudy (PR #45 checkpoint 3 — same
  // atomic conditional upsert shape as daily_teach_usage, fully separate
  // table/counter) ---
  if (has(text, 'INSERT INTO daily_study_usage')) {
    const [userId, limit] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.studyUsage.get(key)
    if (!row) {
      state.studyUsage.set(key, { used_count: 1 })
      return Promise.resolve({ rows: [{ used_count: 1 }] })
    }
    if (row.used_count < limit) {
      row.used_count += 1
      return Promise.resolve({ rows: [{ used_count: row.used_count }] })
    }
    return Promise.resolve({ rows: [] })
  }

  // --- api/_lib/studyLimit.ts: refundStudy ---
  if (has(text, 'UPDATE daily_study_usage')) {
    const [userId] = values
    const key = `${userId}|${state.fakeDateKST}`
    const row = state.studyUsage.get(key)
    if (row && row.used_count > 0) row.used_count -= 1
    return Promise.resolve({ rows: [] })
  }

  // --- api/character.ts: handleSaveKnowledge's idempotency lookup (checked
  // before the general list/count matchers below, since this one also
  // selects FROM character_knowledge_entries) ---
  if (has(text, 'FROM character_knowledge_entries', 'client_request_id =')) {
    const [characterId, requestId] = values
    const row = state.knowledgeEntries.find((e) => e.character_id === characterId && e.client_request_id === requestId)
    return Promise.resolve({ rows: row ? [{ ...row }] : [] })
  }

  // --- api/character.ts: handleListKnowledge's count ---
  if (has(text, 'COUNT(*)', 'character_knowledge_entries')) {
    const [characterId, userId] = values
    const count = state.knowledgeEntries.filter((e) => e.character_id === characterId && e.user_id === userId).length
    return Promise.resolve({ rows: [{ count }] })
  }

  // --- api/character.ts: handleGenerateStudy's "already known titles" list
  // (checked before the generic list matcher below, which returns full
  // entry rows rather than just { title }) ---
  if (has(text, 'SELECT title FROM character_knowledge_entries')) {
    const [characterId, userId, limit] = values
    const rows = state.knowledgeEntries
      .filter((e) => e.character_id === characterId && e.user_id === userId)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((e) => ({ title: e.title }))
    return Promise.resolve({ rows })
  }

  // --- api/character.ts: handleListKnowledge's page of entries ---
  if (has(text, 'FROM character_knowledge_entries')) {
    const [characterId, userId, limit, offset] = values
    const rows = state.knowledgeEntries
      .filter((e) => e.character_id === characterId && e.user_id === userId)
      .slice()
      .reverse() // newest first, matching ORDER BY created_at DESC on insertion order
      .slice(offset, offset + limit)
      .map((e) => ({ ...e }))
    return Promise.resolve({ rows })
  }

  // --- api/character.ts: handleSaveKnowledge's insert. 'appropriate' is a
  // literal in the real query (only ever-'appropriate' rows get inserted),
  // not a bound parameter, so it's not in `values`. ---
  if (has(text, 'INSERT INTO character_knowledge_entries')) {
    const [userId, characterId, profession, title, originalContent, finalContent, verificationExplanation, requestId, source] =
      values
    const id = state.nextKnowledgeEntryId++
    const now = new Date().toISOString()
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      profession,
      title,
      original_content: originalContent,
      final_content: finalContent,
      verification_status: 'appropriate',
      verification_explanation: verificationExplanation,
      client_request_id: requestId,
      source,
      created_at: now,
    }
    state.knowledgeEntries.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }

  // --- api/character.ts: character_messages inserts (PR #45 checkpoint
  // 3.6) — four distinct call sites, each with a different literal
  // substring to disambiguate since the bound-param shape differs
  // slightly per site. Checked most-specific-first. ---

  // handleSaveKnowledge's "saved" log line — the only call site with a
  // literal 'appropriate' verification_status.
  if (has(text, 'INSERT INTO character_messages', "'appropriate'")) {
    const [userId, characterId, source, content, knowledgeEntryId] = values
    const id = state.nextCharacterMessageId++
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      speaker: 'character',
      source,
      content,
      verification_status: 'appropriate',
      knowledge_entry_id: knowledgeEntryId,
      created_at: new Date().toISOString(),
    }
    state.characterMessages.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }

  // handleVerifyKnowledge's user-submitted line.
  if (has(text, 'INSERT INTO character_messages', "'user', 'user_taught'")) {
    const [userId, characterId, content, verificationStatus, knowledgeEntryId] = values
    const id = state.nextCharacterMessageId++
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      speaker: 'user',
      source: 'user_taught',
      content,
      verification_status: verificationStatus,
      knowledge_entry_id: knowledgeEntryId,
      created_at: new Date().toISOString(),
    }
    state.characterMessages.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }

  // handleVerifyKnowledge's character reply line, and handleGenerateStudy's
  // character line — same shape, distinguished only by the literal source,
  // which the mock doesn't need to branch on separately.
  if (has(text, 'INSERT INTO character_messages', "'character', 'user_taught'")) {
    const [userId, characterId, content, verificationStatus, knowledgeEntryId] = values
    const id = state.nextCharacterMessageId++
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      speaker: 'character',
      source: 'user_taught',
      content,
      verification_status: verificationStatus,
      knowledge_entry_id: knowledgeEntryId,
      created_at: new Date().toISOString(),
    }
    state.characterMessages.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }
  if (has(text, 'INSERT INTO character_messages', "'character', 'ai_generated'")) {
    const [userId, characterId, content, verificationStatus, knowledgeEntryId] = values
    const id = state.nextCharacterMessageId++
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      speaker: 'character',
      source: 'ai_generated',
      content,
      verification_status: verificationStatus,
      knowledge_entry_id: knowledgeEntryId,
      created_at: new Date().toISOString(),
    }
    state.characterMessages.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }

  // --- api/character.ts: handleListMessages ---
  if (has(text, 'COUNT(*)', 'character_messages')) {
    const [characterId, userId] = values
    const count = state.characterMessages.filter((m) => m.character_id === characterId && m.user_id === userId).length
    return Promise.resolve({ rows: [{ count }] })
  }
  if (has(text, 'FROM character_messages')) {
    const [characterId, userId, limit, offset] = values
    const rows = state.characterMessages
      .filter((m) => m.character_id === characterId && m.user_id === userId)
      .slice() // already in insertion (= chronological) order, matching ORDER BY created_at ASC
      .slice(offset, offset + limit)
      .map((m) => ({ ...m }))
    return Promise.resolve({ rows })
  }

  // --- api/character.ts: handleSubmitQuiz's atomic "first correct answer"
  // guard — INSERT ... ON CONFLICT DO NOTHING RETURNING, simulated with a
  // Set keyed by (character_id, question_id). ---
  if (has(text, 'INSERT INTO character_quiz_firsts')) {
    const [characterId, questionId] = values
    const key = `${characterId}|${questionId}`
    if (state.quizFirsts.has(key)) return Promise.resolve({ rows: [] })
    state.quizFirsts.add(key)
    return Promise.resolve({ rows: [{ character_id: characterId }] })
  }

  // --- api/character.ts: handleSubmitExam's atomic "first pass" guard —
  // same ON CONFLICT DO NOTHING shape as quiz firsts above. ---
  if (has(text, 'INSERT INTO character_exam_firsts')) {
    const [characterId, profession] = values
    const key = `${characterId}|${profession}`
    if (state.examFirsts.has(key)) return Promise.resolve({ rows: [] })
    state.examFirsts.add(key)
    return Promise.resolve({ rows: [{ character_id: characterId }] })
  }

  // --- api/character.ts: handleGetExam's "already passed before?" check
  // (checked before the generic INSERT matcher above has no overlap here —
  // this is a SELECT, so no ambiguity) ---
  if (has(text, 'SELECT character_id FROM character_exam_firsts')) {
    const [characterId, profession] = values
    const key = `${characterId}|${profession}`
    return Promise.resolve({ rows: state.examFirsts.has(key) ? [{ character_id: characterId }] : [] })
  }

  // --- api/character.ts: handleSubmitQuiz/handleSubmitExam's attempt log ---
  if (has(text, 'INSERT INTO character_exam_attempts')) {
    const [userId, characterId, kind, profession, questionId, score, passed, expAwarded] = values
    const id = state.nextExamAttemptId++
    const entry = {
      id,
      user_id: userId,
      character_id: characterId,
      kind,
      profession,
      question_id: questionId,
      score,
      passed,
      exp_awarded: expAwarded,
      created_at: new Date().toISOString(),
    }
    state.examAttempts.push(entry)
    return Promise.resolve({ rows: [{ ...entry }] })
  }

  throw new Error(`mock-postgres: unhandled statement: ${text}`)
}

module.exports = { sql, seedUser, seedConversation, setFakeDate, reset, state }
