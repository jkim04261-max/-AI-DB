import { useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Sparkles, User } from 'lucide-react'
import { useChats } from '../context/ChatContext'

export default function ChatPage() {
  const { id } = useParams()
  const { getChat, sendMessage } = useChats()
  const [value, setValue] = useState('')
  const chat = getChat(id)

  if (!chat) return <Navigate to="/chat" replace />

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    sendMessage(chat.id, text)
    setValue('')
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-57px)] max-w-3xl flex-col px-4 lg:h-[calc(100svh-65px)]">
      <div className="flex-1 overflow-y-auto py-6">
        <h1 className="mb-4 text-lg font-bold text-slate-900">{chat.title}</h1>

        {chat.messages.length === 0 && (
          <p className="text-sm text-slate-400">메시지를 입력해서 대화를 시작해보세요.</p>
        )}

        <div className="flex flex-col gap-4">
          {chat.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
                  msg.role === 'user'
                    ? 'bg-slate-300'
                    : 'bg-gradient-to-br from-indigo-500 to-blue-500'
                }`}
              >
                {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
              </span>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {msg.role === 'ai' && msg.ai && (
                  <p className="mb-1 text-xs font-semibold text-indigo-400">{msg.ai}</p>
                )}
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-5 pr-2 shadow-sm"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="전송"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white disabled:opacity-40"
        >
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  )
}
