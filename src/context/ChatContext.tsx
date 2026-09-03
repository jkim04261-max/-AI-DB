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
  getChat: (id: string | undefined) => ChatItem | undefined
  startNewChat: (initialText?: string, title?: string) => string
  sendMessage: (id: string, text: string) => void
}

const AI_PROVIDERS: ChatMessage['ai'][] = ['Gemini', 'GPT', 'Claude', 'DeepSeek']

const AI_REPLIES = [
  '네, 바로 도와드릴게요. 조금 더 구체적으로 말씀해주시면 더 정확하게 답변드릴 수 있어요.',
  '질문 내용을 확인했어요. 아래와 같은 방향으로 정리해볼 수 있을 것 같아요.',
  '좋은 질문이에요! 몇 가지 아이디어를 정리해서 알려드릴게요.',
  '요청하신 내용을 분석했어요. 필요하신 형식으로 다시 정리해드릴까요?',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatItem[]>(() =>
    recentChats.map(({ id, title, time, messages }) => ({ id, title, time, messages })),
  )

  const getChat = useCallback(
    (id: string | undefined) => chats.find((c) => c.id === id),
    [chats],
  )

  const startNewChat = useCallback((initialText?: string, title?: string) => {
    const id = `chat-${Date.now()}`
    const messages: ChatMessage[] = []
    if (initialText) {
      messages.push({ role: 'user', text: initialText })
      const ai = pick(AI_PROVIDERS)
      messages.push({ role: 'ai', ai, text: pick(AI_REPLIES) })
    }
    const newChat: ChatItem = {
      id,
      title: title ?? initialText ?? '새 대화',
      time: '방금 전',
      messages,
    }
    setChats((prev) => [newChat, ...prev])
    return id
  }, [])

  const sendMessage = useCallback((id: string, text: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== id) return chat
        const ai = pick(AI_PROVIDERS)
        return {
          ...chat,
          time: '방금 전',
          messages: [
            ...chat.messages,
            { role: 'user', text },
            { role: 'ai', ai, text: pick(AI_REPLIES) },
          ],
        }
      }),
    )
  }, [])

  return (
    <ChatContext.Provider value={{ chats, getChat, startNewChat, sendMessage }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChats() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChats must be used within ChatProvider')
  return ctx
}
