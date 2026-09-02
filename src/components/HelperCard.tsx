import { Check, Bot } from 'lucide-react'

const items = ['빠르고 정확한 정보 제공', '문서 요약 및 분석', '아이디어 생성 및 기획', '업무 자동화 및 효율화']

export default function HelperCard() {
  return (
    <div className="hidden flex-col justify-between rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-5 lg:flex">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">누리AI가 도와드리는 일</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
              <Check size={16} className="text-indigo-500" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex justify-end">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-500 shadow-sm">
          <Bot size={28} />
        </span>
      </div>
    </div>
  )
}
