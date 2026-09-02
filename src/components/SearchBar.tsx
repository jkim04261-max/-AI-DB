import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useChats } from '../context/ChatContext'

export default function SearchBar() {
  const [value, setValue] = useState('')
  const { startNewChat } = useChats()
  const navigate = useNavigate()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    const id = startNewChat(text)
    navigate(`/chat/${id}`)
    setValue('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-5 pr-2 shadow-sm shadow-slate-100 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="궁금한 것을 입력해보세요..."
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
      />
      <button
        type="submit"
        aria-label="전송"
        disabled={!value.trim()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white transition disabled:opacity-40"
      >
        <ArrowRight size={18} />
      </button>
    </form>
  )
}
