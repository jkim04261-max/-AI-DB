import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { upload } from '@vercel/blob/client'
import { ArrowLeft, Film, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  PERSONAL_KNOWLEDGE_LOG_CATEGORIES,
  PERSONAL_KNOWLEDGE_LOG_CATEGORY_LABEL,
  PERSONAL_KNOWLEDGE_LOG_CATEGORY_ICON,
  PERSONAL_KNOWLEDGE_LOG_VISIBILITIES,
  PERSONAL_KNOWLEDGE_LOG_VISIBILITY_LABEL,
  PERSONAL_KNOWLEDGE_LOG_VISIBILITY_DESCRIPTION,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_TAGS_LENGTH,
  MAX_CONTENT_LENGTH,
  COPYRIGHT_PRIVACY_NOTICE,
  looksLikeSensitiveContent,
  type PersonalKnowledgeLogCategory,
  type PersonalKnowledgeLogVisibility,
} from '../data/personalKnowledgeLog'
import {
  KNOWLEDGE_LOG_ATTACHMENT_TYPES,
  MAX_KNOWLEDGE_LOG_ATTACHMENTS,
  knowledgeLogAttachmentKind,
  maxBytesForKind,
} from '../data/knowledgeLogAttachments'

interface KnowledgeLogAttachment {
  url: string
  mimeType: string | null
  name: string | null
}

interface KnowledgeLogEntry {
  id: number
  entryDate: string
  businessName: string | null
  category: PersonalKnowledgeLogCategory
  tags: string | null
  content: string
  visibility: PersonalKnowledgeLogVisibility
  attachments: KnowledgeLogAttachment[]
}

// 지시서(실제 업무·연구·비법·노하우 기록 시스템): 오늘 날짜 기본값 —
// 로컬 타임존 기준(KST 서비스라 UTC 변환 없이 그대로 써도 충분하다).
function todayDateInputValue(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// 선택한 파일을 올리기 전에 먼저 걸러낸다 — MIME 타입이 허용 목록에
// 없거나(=.exe 등 실행 파일도 여기서 막힌다) 종류별 용량 한도를
// 넘으면 서버/Blob에 요청을 보내지도 않는다. 실제 차단은 서버(api/
// blob/upload.ts의 allowedContentTypes)가 최종적으로 하지만, 여기서
// 먼저 걸러야 사용자가 기다리지 않고 바로 이유를 알 수 있다.
function validateFile(file: File): string | null {
  const kind = knowledgeLogAttachmentKind(file.type)
  if (!kind) {
    return `${file.name}: 사진(PNG/JPEG/WEBP/GIF) 또는 동영상(MP4/WEBM/MOV)만 첨부할 수 있어요.`
  }
  const maxBytes = maxBytesForKind(kind)
  if (file.size > maxBytes) {
    return `${file.name}: ${kind === 'video' ? '동영상은' : '사진은'} ${maxBytes / (1024 * 1024)}MB 이하만 첨부할 수 있어요.`
  }
  return null
}

export default function KnowledgeLogPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [entries, setEntries] = useState<KnowledgeLogEntry[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [entryDate, setEntryDate] = useState(todayDateInputValue())
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState<PersonalKnowledgeLogCategory>('work_log')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<PersonalKnowledgeLogVisibility>('private')
  const [existingAttachments, setExistingAttachments] = useState<KnowledgeLogAttachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [sensitiveConfirmOpen, setSensitiveConfirmOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadEntries = async () => {
    setListError(null)
    try {
      const res = await fetch('/api/character?action=knowledge-log')
      const data = (await res.json().catch(() => ({}))) as { entries?: KnowledgeLogEntry[]; error?: string }
      if (!res.ok) throw new Error(data.error || '지식 기록을 불러오는 중 오류가 발생했어요.')
      setEntries(data.entries ?? [])
    } catch (err) {
      setListError(err instanceof Error ? err.message : '지식 기록을 불러오는 중 오류가 발생했어요.')
    }
  }

  useEffect(() => {
    if (user) void loadEntries()
  }, [user])

  const resetForm = () => {
    setEditingId(null)
    setEntryDate(todayDateInputValue())
    setBusinessName('')
    setCategory('work_log')
    setTags('')
    setContent('')
    setVisibility('private')
    setExistingAttachments([])
    setPendingFiles([])
    setFileError(null)
    setSaveError(null)
  }

  const startEdit = (entry: KnowledgeLogEntry) => {
    setEditingId(entry.id)
    setEntryDate(entry.entryDate.slice(0, 10))
    setBusinessName(entry.businessName ?? '')
    setCategory(entry.category)
    setTags(entry.tags ?? '')
    setContent(entry.content)
    setVisibility(entry.visibility)
    setExistingAttachments(entry.attachments)
    setPendingFiles([])
    setFileError(null)
    setSaveError(null)
  }

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setFileError(null)
    const currentCount = existingAttachments.length + pendingFiles.length
    const availableSlots = MAX_KNOWLEDGE_LOG_ATTACHMENTS - currentCount
    if (availableSlots <= 0) {
      setFileError(`첨부 파일은 최대 ${MAX_KNOWLEDGE_LOG_ATTACHMENTS}개까지만 가능해요.`)
      return
    }
    const picked = Array.from(files).slice(0, availableSlots)
    for (const file of picked) {
      const error = validateFile(file)
      if (error) {
        setFileError(error)
        return
      }
    }
    setPendingFiles((prev) => [...prev, ...picked])
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const removeExistingAttachment = (index: number) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const saveEntry = async () => {
    if (!content.trim()) {
      setSaveError('내용을 입력해주세요.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      let uploadedAttachments = existingAttachments.map((a) => ({ url: a.url, mimeType: a.mimeType, name: a.name }))
      if (pendingFiles.length > 0) {
        setUploading(true)
        const uploaded = await Promise.all(
          pendingFiles.map((file) => {
            const kind = knowledgeLogAttachmentKind(file.type) ?? 'image'
            return upload(`knowledge-log/${user?.id}/${Date.now()}-${file.name}`, file, {
              access: 'public',
              handleUploadUrl: '/api/blob/upload',
              clientPayload: JSON.stringify({ purpose: 'knowledge-log', kind }),
            })
          }),
        )
        uploadedAttachments = [
          ...uploadedAttachments,
          ...uploaded.map((blob, i) => ({ url: blob.url, mimeType: blob.contentType ?? null, name: pendingFiles[i].name })),
        ]
        setUploading(false)
      }

      const res = await fetch('/api/character?action=knowledge-log-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId ?? undefined,
          entryDate,
          businessName: businessName.trim() || undefined,
          category,
          tags: tags.trim() || undefined,
          content,
          visibility,
          attachments: uploadedAttachments,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || '지식 기록을 저장하는 중 오류가 발생했어요.')

      resetForm()
      await loadEntries()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '지식 기록을 저장하는 중 오류가 발생했어요.')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const handleSaveClick = () => {
    // 지시서 3번: "타인의 저작물이나 개인정보가 포함된 것으로 의심되는
    // 콘텐츠는 저장 시 경고 팝업을 띄우세요" — 저장을 막지는 않고, 한
    // 번 더 확인시킨 뒤 그대로 진행할 수 있다.
    if (looksLikeSensitiveContent(content)) {
      setSensitiveConfirmOpen(true)
      return
    }
    void saveEntry()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    try {
      const res = await fetch('/api/character?action=knowledge-log-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || '삭제하는 중 오류가 발생했어요.')
      if (editingId === id) resetForm()
      await loadEntries()
    } catch (err) {
      setListError(err instanceof Error ? err.message : '삭제하는 중 오류가 발생했어요.')
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 lg:max-w-none xl:px-10">
        <h1 className="text-xl font-bold text-slate-900">지식 기록장</h1>
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 lg:max-w-none xl:px-10">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/mypage')}
          aria-label="마이페이지로 돌아가기"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-slate-900">지식 기록장</h1>
      </div>
      <p className="text-sm text-slate-500">
        실제 업무, 연구, 성공·실패 사례, 꿀팁 등 나만의 지식과 노하우를 기록해 보세요.
      </p>

      {/* 입력 폼 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{editingId ? '기록 수정하기' : '새 기록 쓰기'}</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">날짜</span>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">직장/상호명 (선택)</span>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={MAX_BUSINESS_NAME_LENGTH}
              placeholder="예: OO상사, OO병원"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-600">주제(카테고리)</span>
          <div className="flex flex-wrap gap-1.5">
            {PERSONAL_KNOWLEDGE_LOG_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                data-testid={`knowledge-log-category-${cat}`}
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  category === cat ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {PERSONAL_KNOWLEDGE_LOG_CATEGORY_ICON[cat]} {PERSONAL_KNOWLEDGE_LOG_CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">태그 (선택, 쉼표로 구분)</span>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={MAX_TAGS_LENGTH}
            placeholder="예: 세무, 계약서, 신규고객"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">내용</span>
          <textarea
            data-testid="knowledge-log-content-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            rows={6}
            placeholder="업무일지, 연구메모, 성공·실패 사례, 꿀팁 등 자유롭게 적어주세요."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-600">공개 범위</span>
          <div className="flex flex-wrap gap-1.5">
            {PERSONAL_KNOWLEDGE_LOG_VISIBILITIES.map((v) => (
              <button
                key={v}
                type="button"
                data-testid={`knowledge-log-visibility-${v}`}
                aria-pressed={visibility === v}
                onClick={() => setVisibility(v)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  visibility === v ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {PERSONAL_KNOWLEDGE_LOG_VISIBILITY_LABEL[v]}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{PERSONAL_KNOWLEDGE_LOG_VISIBILITY_DESCRIPTION[visibility]}</p>
        </div>

        {/* 첨부 */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-600">사진·동영상 첨부 (선택, 최대 {MAX_KNOWLEDGE_LOG_ATTACHMENTS}개)</span>
          <div className="flex flex-wrap gap-2">
            {existingAttachments.map((a, i) => (
              <div key={`existing-${i}`} className="relative flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                {a.mimeType?.startsWith('video/') ? <Film size={14} /> : <ImageIcon size={14} />}
                <span className="max-w-[10rem] truncate">{a.name ?? '첨부 파일'}</span>
                <button type="button" onClick={() => removeExistingAttachment(i)} aria-label="첨부 제거" className="text-slate-400 hover:text-rose-500">
                  <X size={14} />
                </button>
              </div>
            ))}
            {pendingFiles.map((file, i) => (
              <div key={`pending-${i}`} className="relative flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-700">
                {file.type.startsWith('video/') ? <Film size={14} /> : <ImageIcon size={14} />}
                <span className="max-w-[10rem] truncate">{file.name}</span>
                <button type="button" onClick={() => removePendingFile(i)} aria-label="첨부 제거" className="text-indigo-400 hover:text-rose-500">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={existingAttachments.length + pendingFiles.length >= MAX_KNOWLEDGE_LOG_ATTACHMENTS}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              <Paperclip size={14} />
              파일 선택
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={KNOWLEDGE_LOG_ATTACHMENT_TYPES.join(',')}
              onChange={(e) => {
                handleFilesSelected(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
          </div>
          {fileError && <p className="text-xs text-rose-500">{fileError}</p>}
          <p className="text-xs text-slate-400">사진은 5MB, 동영상은 50MB까지 첨부할 수 있어요.</p>
        </div>

        {/* 지시서 3번: 저작권/개인정보 경고 문구 고정 노출 */}
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">⚠️ {COPYRIGHT_PRIVACY_NOTICE}</p>

        {saveError && <p className="text-xs text-rose-500">{saveError}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="knowledge-log-save-button"
            onClick={handleSaveClick}
            disabled={saving || uploading || !content.trim()}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {uploading ? '파일 업로드 중...' : saving ? '저장 중...' : editingId ? '수정 저장' : '기록 저장'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">
              취소
            </button>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">내 기록 {entries ? `(${entries.length}개)` : ''}</h2>
        {listError && <p className="text-sm text-rose-500">{listError}</p>}
        {entries === null && !listError && <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />}
        {entries !== null && entries.length === 0 && <p className="text-sm text-slate-400">아직 기록한 지식이 없어요.</p>}
        {entries?.map((entry) => (
          <div key={entry.id} data-testid="knowledge-log-entry" className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">
                  {entry.entryDate.slice(0, 10)} · {PERSONAL_KNOWLEDGE_LOG_CATEGORY_ICON[entry.category]}{' '}
                  {PERSONAL_KNOWLEDGE_LOG_CATEGORY_LABEL[entry.category]}
                  {entry.businessName ? ` · ${entry.businessName}` : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{entry.content}</p>
                {entry.tags && <p className="mt-1 text-xs text-indigo-500">#{entry.tags.replaceAll(',', ' #')}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {PERSONAL_KNOWLEDGE_LOG_VISIBILITY_LABEL[entry.visibility]}
              </span>
            </div>
            {entry.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.attachments.map((a, i) =>
                  a.mimeType?.startsWith('video/') ? (
                    <video key={i} src={a.url} controls className="h-24 w-32 rounded-lg bg-slate-100 object-cover" />
                  ) : (
                    <img key={i} src={a.url} alt={a.name ?? '첨부 이미지'} className="h-24 w-24 rounded-lg object-cover" />
                  ),
                )}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={() => startEdit(entry)} className="font-semibold text-indigo-500 hover:text-indigo-600">
                수정
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(entry.id)}
                className="flex items-center gap-1 font-semibold text-rose-500 hover:text-rose-600"
              >
                <Trash2 size={12} />
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      {sensitiveConfirmOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div data-testid="sensitive-content-warning" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">개인정보가 포함된 것 같아요</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              주민등록번호, 전화번호, 이메일, 계좌번호처럼 보이는 내용이 들어있어요. 타인의 개인정보라면 등록할 수 없어요. 그래도
              계속 저장할까요?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSensitiveConfirmOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                다시 확인할게요
              </button>
              <button
                type="button"
                data-testid="sensitive-content-confirm-save"
                onClick={() => {
                  setSensitiveConfirmOpen(false)
                  void saveEntry()
                }}
                className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                그대로 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
