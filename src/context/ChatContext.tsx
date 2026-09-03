import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { recentChats, type ChatMessage } from '../data/chats'

export interface ChatItem {
  id: string
  title: string
  time: string
  messages: ChatMessage[]
}

interface ChatContextValue {
  chats: ChatItem[]
  pendingIds: Set<string>
  getChat: (id: string | undefined) => ChatItem | undefined
  startNewChat: (initialText?: string, title?: string) => string
  sendMessage: (id: string, text: string) => void
}

async function fetchGeminiReply(message: string, history: ChatMessage[]): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map((m) => ({ role: m.role, text: m.text })),
    }),
  })

  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }

  if (!res.ok) {
    throw new Error(data.error || 'Gemini 응답을 받지 못했어요.')
  }

  return data.text ?? ''
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatItem[]>(() =>
    recentChats.map(({ id, title, time, messages }) => ({ id, title, time, messages })),
  )
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const getChat = useCallback(
    (id: string | undefined) => chats.find((c) => c.id === id),
    [chats],
  )

  const setPending = useCallback((id: string, isPending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (isPending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const appendAiReply = useCallback((id: string, text: string, error = false) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === id
          ? {
              ...chat,
              time: '방금 전',
              messages: [...chat.messages, { role: 'ai', ai: 'Gemini', text, error }],
            }
          : chat,
      ),
    )
  }, [])

  const requestReply = useCallback(
    (id: string, message: string, history: ChatMessage[]) => {
      setPending(id, true)
      fetchGeminiReply(message, history)
        .then((text) => appendAiReply(id, text))
        .catch((err: Error) => appendAiReply(id, err.message, true))
        .finally(() => setPending(id, false))
    },
    [appendAiReply, setPending],
  )

  const startNewChat = useCallback(
    (initialText?: string, title?: string) => {
      const id = `chat-${Date.now()}`
      const messages: ChatMessage[] = initialText ? [{ role: 'user', text: initialText }] : []
      const newChat: ChatItem = {
        id,
        title: title ?? initialText ?? '새 대화',
        time: '방금 전',
        messages,
      }
      setChats((prev) => [newChat, ...prev])

      if (initialText) {
        requestReply(id, initialText, [])
      }

      return id
    },
    [requestReply],
  )

  const sendMessage = useCallback(
    (id: string, text: string) => {
      const chat = chats.find((c) => c.id === id)
      const history = chat?.messages ?? []

      setChats((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, time: '방금 전', messages: [...c.messages, { role: 'user', text }] }
            : c,
        ),
      )

      requestReply(id, text, history)
    },
    [chats, requestReply],
  )

  return (
    <ChatContext.Provider value={{ chats, pendingIds, getChat, startNewChat, sendMessage }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChats() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChats must be used within ChatProvider')
  return ctx
}
