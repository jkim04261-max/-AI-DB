import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import ChatListPage from './pages/ChatListPage'
import ChatPage from './pages/ChatPage'
import GrowPage from './pages/GrowPage'
import CardMatchPage from './pages/CardMatchPage'
import JobQuizPage from './pages/JobQuizPage'
import CategoryPage from './pages/CategoryPage'
import TemplatesPage from './pages/TemplatesPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import MyPage from './pages/MyPage'
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
            {/* 지시서(직업 카드 맞추기 미니게임): 신규 라우트. 새 라우트가
                실제로 접근 가능하려면 이 테이블에 등록하는 것 말고는
                방법이 없어, "기존 파일 수정 금지" 중 이 한 줄만
                예외로 두었다(사용자 확인). */}
            <Route path="/card-match" element={<CardMatchPage />} />
            {/* 지시서(직업 그림 퀴즈): 이 기능도 새 라우트로 접근 가능해야
                해서 등록한다. */}
            <Route path="/job-quiz" element={<JobQuizPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/mypage" element={<MyPage />} />
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
