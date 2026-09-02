const notifications = [
  { title: '문서 분석이 완료됐어요', time: '5분 전' },
  { title: '새로운 템플릿이 추가됐어요', time: '2시간 전' },
  { title: '주간 사용 리포트가 도착했어요', time: '어제' },
]

export default function NotificationDropdown({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-4 top-14 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:right-8"
      >
        <p className="px-3 py-2 text-sm font-semibold text-slate-800">알림</p>
        <ul className="flex flex-col">
          {notifications.map((n) => (
            <li
              key={n.title}
              className="cursor-pointer rounded-xl px-3 py-2 hover:bg-slate-50"
            >
              <p className="text-sm text-slate-700">{n.title}</p>
              <p className="text-xs text-slate-400">{n.time}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
