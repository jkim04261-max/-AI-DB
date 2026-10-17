import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ChatProvider } from './context/ChatContext'
import { AuthProvider } from './context/AuthContext'
import { GrowthProvider } from './context/GrowthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ChatProvider>
          <GrowthProvider>
            <App />
          </GrowthProvider>
        </ChatProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
