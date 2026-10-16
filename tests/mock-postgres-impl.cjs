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
  passwordResetTokens: [], // { id, user_id, token_hash, expires_at, used_at }
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
  state.passwordResetTokens = []
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

  throw new Error(`mock-postgres: unhandled statement: ${text}`)
}

module.exports = { sql, seedUser, seedConversation, setFakeDate, reset, state }
