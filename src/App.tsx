import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import ChatListPage from './pages/ChatListPage'
import ChatPage from './pages/ChatPage'
import GrowPage from './pages/GrowPage'
import JobQuizPage from './pages/JobQuizPage'
import CategoryPage from './pages/CategoryPage'
import TemplatesPage from './pages/TemplatesPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import MyPage from './pages/MyPage'
import KnowledgeLogPage from './pages/KnowledgeLogPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import AiNoticePage from './pages/AiNoticePage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header />
        <main className="flex-1 pb-20 lg:pb-0">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<ChatListPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            <Route path="/grow" element={<GrowPage />} />
            {/* 지시서(사이드바 '직업 카드 맞추기' 메뉴 삭제): /card-match
                라우트 등록을 제거해 더 이상 접근할 수 없게 막았다 — 같은
                미니게임은 이제 /grow의 '가르치기' 모달(teen 커리큘럼 ②단계)
                안에서만 뜬다. 페이지 파일(CardMatchPage.tsx) 자체는 "기존
                파일 삭제 금지" 규칙에 따라 지우지 않고 그대로 남겨둔다. */}
            {/* 지시서(직업 그림 퀴즈): 이 기능도 새 라우트로 접근 가능해야
                해서 등록한다. */}
            <Route path="/job-quiz" element={<JobQuizPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/mypage" element={<MyPage />} />
            {/* 지시서(실제 업무·연구·비법·노하우 기록 시스템): "지식
                기록장" 전용 화면 — 사이드바에는 추가하지 않는다
                (src/data/nav.ts가 이미 의도적으로 최소화돼 있다,
                "템플릿/즐겨찾기도 더 이상 사이드바에 없음" 주석 참고).
                마이페이지의 카드로만 진입한다. */}
            <Route path="/knowledge-log" element={<KnowledgeLogPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/ai-notice" element={<AiNoticePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
