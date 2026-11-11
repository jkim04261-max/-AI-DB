import { Link } from 'react-router-dom'

// 공식 로고 교체: 기존 Sparkles 아이콘 배지를 신규 공식 로고 이미지로
// 바꿨다 — Header/Sidebar/MobileMenu가 전부 이 컴포넌트 하나만 쓰고
// 있어서(withIcon을 넘기지 않던 기존 호출부 포함), 아이콘 자체를
// 기본으로 보이게(withIcon 기본값 true) 바꿔야 "헤더·사이드바 전부
// 교체" 요청이 실제로 반영된다. 비율이 찌그러지지 않도록 항상 정사각
// 박스 안에서 object-contain으로 그린다.
export default function Logo({ withIcon = true }: { withIcon?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0">
      {withIcon && (
        <img
          src="/assets/logo.png"
          alt="누리AI 로고"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-xl object-contain"
        />
      )}
      <span className="text-xl font-extrabold tracking-tight text-slate-900">
        누리
        <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent">
          AI
        </span>
      </span>
    </Link>
  )
}
