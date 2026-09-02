import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import ChatListPage from './pages/ChatListPage'
import ChatPage from './pages/ChatPage'
import CategoryPage from './pages/CategoryPage'
import TemplatesPage from './pages/TemplatesPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import MyPage from './pages/MyPage'

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
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/mypage" element={<MyPage />} />
          </Routes>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
