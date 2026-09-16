import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChatAttachment, ChatMessage } from '../data/chats'
import { formatRelativeTime } from '../lib/time'
import { useAuth } from './AuthContext'

export interface ChatItem {
  id: string
  title: string
  time: string
  messages: ChatMessage[]
  messagesLoaded: boolean
}

interface ConversationSummary {
  id: number
  title: string
  updated_at: string
}

interface ChatContextValue {
  chats: ChatItem[]
  pendingIds: Set<string>
  getChat: (id: string | undefined) => ChatItem | undefined
  loadConversation: (id: string) => void
  startNewChat: (initialText?: string, title?: string) => Promise<string | null>
  sendMessage: (id: string, text: string, attachment?: ChatAttachment) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const loadingIdsRef = useRef<Set<string>>(new Set())

  // Conversations are stored per-user in Postgres, so the list is cleared
  // and re-fetched whenever the signed-in user changes (including logout).
  useEffect(() => {
    if (!user) {
      setChats([])
      return
    }

    let cancelled = false
    fetch('/api/conversations')
      .then((res) => res.json())
      .then((data: { conversations?: ConversationSummary[] }) => {
        if (cancelled) return
        setChats(
          (data.conversations ?? []).map((c) => ({
            id: String(c.id),
            title: c.title,
            time: formatRelativeTime(c.updated_at),
            messages: [],
            messagesLoaded: false,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setChats([])
      })

    return () => {
      cancelled = true
    }
  }, [user])

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

  const loadConversation = useCallback((id: string) => {
    if (loadingIdsRef.current.has(id)) return
    loadingIdsRef.current.add(id)

    fetch(`/api/conversations/${id}`)
      .then((res) => res.json())
      .then((data: { conversation?: { messages: ChatMessage[] } }) => {
        if (!data.conversation) return
        setChats((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, messages: data.conversation!.messages, messagesLoaded: true }
              : c,
          ),
        )
      })
      .finally(() => {
        loadingIdsRef.current.delete(id)
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

  const sendMessage = useCallback(
    (id: string, text: string, attachment?: ChatAttachment) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                time: '방금 전',
                messages: [...c.messages, { role: 'user', text, attachment }],
              }
            : c,
        ),
      )
      setPending(id, true)

      fetch(`/api/conversations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, attachment }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            aiMessage?: ChatMessage
            error?: string
          }
          if (!res.ok || !data.aiMessage) {
            throw new Error(data.error || 'Gemini 응답을 받지 못했어요.')
          }
          appendAiReply(id, data.aiMessage.text, data.aiMessage.error)
        })
        .catch((err: Error) => appendAiReply(id, err.message, true))
        .finally(() => setPending(id, false))
    },
    [appendAiReply, setPending],
  )

  const startNewChat = useCallback(
    async (initialText?: string, title?: string) => {
      if (!user) {
        navigate('/login')
        return null
      }

      const chatTitle = title ?? initialText ?? '새 대화'

      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: chatTitle }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          conversation?: { id: number; title: string }
        }
        if (!res.ok || !data.conversation) return null

        const id = String(data.conversation.id)
        const newChat: ChatItem = {
          id,
          title: data.conversation.title,
          time: '방금 전',
          messages: [],
          messagesLoaded: true,
        }
        setChats((prev) => [newChat, ...prev])

        if (initialText) {
          sendMessage(id, initialText)
        }

        return id
      } catch {
        return null
      }
    },
    [user, navigate, sendMessage],
  )

  return (
    <ChatContext.Provider
      value={{ chats, pendingIds, getChat, loadConversation, startNewChat, sendMessage }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChats() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChats must be used within ChatProvider')
  return ctx
}
