import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from 'react'
import { AlertCircle, ArrowRight, Paperclip, X } from 'lucide-react'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_COUNT,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
} from '../lib/attachments'

interface ChatInputProps {
  onSendMessage: (text: string, files: File[]) => void
  isLoading: boolean
}

interface SelectedFile {
  file: File
  previewUrl: string
}

const sumBytes = (files: File[]) => files.reduce((sum, f) => sum + f.size, 0)

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<SelectedFile[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<SelectedFile[]>([])

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // Revoke every preview object URL still outstanding when the component
  // unmounts (e.g. navigating away mid-compose), so we don't leak memory.
  useEffect(() => {
    return () => {
      selectedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    }
  }, [])

  const processFiles = (newFiles: File[]) => {
    setErrorMsg(null)
    if (newFiles.length === 0) return

    const validFiles = newFiles.filter((file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setErrorMsg('PNG, JPEG, WEBP, GIF 이미지만 첨부할 수 있어요.')
        return false
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setErrorMsg(`이미지는 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB 이하만 첨부할 수 있어요.`)
        return false
      }
      return true
    })
    if (validFiles.length === 0) return

    const availableSlots = MAX_FILE_COUNT - selected.length
    if (availableSlots <= 0) {
      setErrorMsg(`이미지는 최대 ${MAX_FILE_COUNT}장까지만 첨부할 수 있어요.`)
      return
    }

    let filesToAdd = validFiles
    if (filesToAdd.length > availableSlots) {
      setErrorMsg(`최대 ${MAX_FILE_COUNT}장까지만 첨부 가능해서 ${availableSlots}장만 추가했어요.`)
      filesToAdd = filesToAdd.slice(0, availableSlots)
    }

    // Trim from the end until the running total (existing + new) fits under
    // the combined cap — matches the backend's MAX_TOTAL_ATTACHMENT_BYTES,
    // so a rejection here doesn't just surface later as a failed send.
    const existingBytes = sumBytes(selected.map((s) => s.file))
    while (filesToAdd.length > 0 && existingBytes + sumBytes(filesToAdd) > MAX_TOTAL_IMAGE_BYTES) {
      setErrorMsg(
        `첨부 이미지 전체 용량은 ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB를 넘을 수 없어요.`,
      )
      filesToAdd = filesToAdd.slice(0, -1)
    }
    if (filesToAdd.length === 0) return

    setSelected((prev) => [
      ...prev,
      ...filesToAdd.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ])
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files))
      e.target.value = '' // allow re-selecting the same file later
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const pastedFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) pastedFiles.push(file)
      }
    }
    if (pastedFiles.length > 0) {
      processFiles(pastedFiles)
    }
  }

  const removeFile = (index: number) => {
    setSelected((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
    setErrorMsg(null)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && selected.length === 0) || isLoading) return

    onSendMessage(trimmed, selected.map((s) => s.file))
    selected.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    setText('')
    setSelected([])
    setErrorMsg(null)
  }

  return (
    <div>
      {errorMsg && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((s, idx) => (
            <div key={s.previewUrl} className="relative">
              <img
                src={s.previewUrl}
                alt={s.file.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(idx)}
                aria-label={`${s.file.name} 제거`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <span className="self-center text-xs text-slate-400">
            ({selected.length}/{MAX_FILE_COUNT})
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-3 pr-2 shadow-sm"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading || selected.length >= MAX_FILE_COUNT}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || selected.length >= MAX_FILE_COUNT}
          aria-label="이미지 첨부"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
        >
          <Paperclip size={18} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          placeholder="메시지를 입력하세요... (이미지 붙여넣기 가능)"
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || (!text.trim() && selected.length === 0)}
          aria-label="전송"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white disabled:opacity-40"
        >
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  )
}
