import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Paperclip, Sparkles, User, X } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { useChats } from '../context/ChatContext'
import type { ChatAttachment } from '../data/chats'
import MarkdownMessage from '../components/MarkdownMessage'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // keep in sync with api/blob/upload.ts

export default function ChatPage() {
  const { id } = useParams()
  const { getChat, sendMessage, loadConversation, pendingIds } = useChats()
  const [value, setValue] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chat = getChat(id)

  useEffect(() => {
    if (chat && !chat.messagesLoaded) {
      loadConversation(chat.id)
    }
  }, [chat, loadConversation])

  // Revoke the object URL used for the preview thumbnail once it's replaced
  // or the component unmounts, so we don't leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  if (!chat) return <Navigate to="/chat" replace />

  const isPending = pendingIds.has(chat.id)
  const isBusy = isPending || isUploading

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setAttachError('PNG, JPEG, WEBP, GIF 이미지만 첨부할 수 있어요.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachError('이미지는 8MB 이하만 첨부할 수 있어요.')
      return
    }

    setAttachError(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if ((!text && !selectedFile) || isBusy) return

    let attachment: ChatAttachment | undefined
    if (selectedFile) {
      setIsUploading(true)
      try {
        const blob = await upload(`chat/${chat.id}/${Date.now()}-${selectedFile.name}`, selectedFile, {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
        })
        attachment = { url: blob.url, mimeType: blob.contentType, name: selectedFile.name }
      } catch {
        setAttachError('이미지 업로드에 실패했어요. 다시 시도해주세요.')
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }

    sendMessage(chat.id, text, attachment)
    setValue('')
    clearAttachment()
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-57px)] max-w-3xl flex-col px-4 lg:h-[calc(100svh-65px)]">
      <div className="flex-1 overflow-y-auto py-6">
        <h1 className="mb-4 text-lg font-bold text-slate-900">{chat.title}</h1>

        {chat.messages.length === 0 && !isPending && (
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
                    : msg.error
                      ? 'bg-red-50 text-red-600'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {msg.role === 'ai' && msg.ai && (
                  <p
                    className={`mb-1 text-xs font-semibold ${msg.error ? 'text-red-400' : 'text-indigo-400'}`}
                  >
                    {msg.error ? '오류' : msg.ai}
                  </p>
                )}
                {msg.attachment && (
                  <img
                    src={msg.attachment.url}
                    alt={msg.attachment.name ?? '첨부 이미지'}
                    className={`mb-2 max-h-64 max-w-full rounded-lg object-contain ${msg.text ? '' : 'mb-0'}`}
                  />
                )}
                {msg.text &&
                  (msg.role === 'ai' && !msg.error ? (
                    <MarkdownMessage text={msg.text} />
                  ) : (
                    msg.text
                  ))}
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
                <Sparkles size={16} className="animate-spin" />
              </span>
              <div className="flex max-w-[75%] items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
                <span>답변을 생성하고 있어요</span>
                <span className="inline-flex items-end gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {attachError && <p className="mb-2 text-xs text-red-500">{attachError}</p>}

      {previewUrl && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            <img src={previewUrl} alt="첨부 미리보기" className="h-16 w-16 rounded-lg object-cover" />
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="첨부 제거"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mb-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-3 pr-2 shadow-sm"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          aria-label="이미지 첨부"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
        >
          <Paperclip size={18} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={isBusy}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={(!value.trim() && !selectedFile) || isBusy}
          aria-label="전송"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white disabled:opacity-40"
        >
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  )
}
