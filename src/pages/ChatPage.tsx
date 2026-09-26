import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { RotateCcw, Sparkles, User } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { useChats } from '../context/ChatContext'
import type { ChatAttachment } from '../data/chats'
import MarkdownMessage from '../components/MarkdownMessage'
import ChatInput from '../components/ChatInput'

export default function ChatPage() {
  const { id } = useParams()
  const { getChat, sendMessage, loadConversation, pendingIds, retryLastMessage } = useChats()
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const chat = getChat(id)

  useEffect(() => {
    if (chat && !chat.messagesLoaded) {
      loadConversation(chat.id)
    }
  }, [chat, loadConversation])

  if (!chat) return <Navigate to="/chat" replace />

  const isPending = pendingIds.has(chat.id)
  const isBusy = isPending || isUploading

  const handleSend = async (text: string, files: File[]) => {
    if (isBusy) return

    let attachments: ChatAttachment[] | undefined
    if (files.length > 0) {
      setIsUploading(true)
      try {
        const uploaded = await Promise.all(
          files.map((file) =>
            upload(`chat/${chat.id}/${Date.now()}-${file.name}`, file, {
              access: 'public',
              handleUploadUrl: '/api/blob/upload',
            }),
          ),
        )
        attachments = uploaded.map((blob, i) => ({
          url: blob.url,
          mimeType: blob.contentType,
          name: files[i].name,
        }))
      } catch {
        setAttachError('이미지 업로드에 실패했어요. 다시 시도해주세요.')
        setIsUploading(false)
        return
      }
      setAttachError(null)
      setIsUploading(false)
    }

    sendMessage(chat.id, text, attachments)
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
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className={`mb-2 flex flex-wrap gap-1 ${msg.text ? '' : 'mb-0'}`}>
                    {msg.attachments.map((attachment, ai) => (
                      <img
                        key={ai}
                        src={attachment.url}
                        alt={attachment.name ?? '첨부 이미지'}
                        className="max-h-48 max-w-full rounded-lg object-contain"
                      />
                    ))}
                  </div>
                )}
                {msg.text &&
                  (msg.role === 'ai' && !msg.error ? (
                    <MarkdownMessage text={msg.text} />
                  ) : (
                    msg.text
                  ))}
                {msg.role === 'ai' && msg.error && i === chat.messages.length - 1 && !isPending && (
                  <button
                    type="button"
                    onClick={() => retryLastMessage(chat.id)}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700"
                  >
                    <RotateCcw size={12} />
                    다시 시도
                  </button>
                )}
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

      <div className="mb-4">
        <ChatInput onSendMessage={handleSend} isLoading={isBusy} />
      </div>
    </div>
  )
}
