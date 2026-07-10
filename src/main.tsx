import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker 등록 — 홈화면 PWA 캐시 업데이트 자동화
// 규칙: HTML은 항상 네트워크 우선, 해시된 JS/CSS는 캐시 우선, 외부 출처(Supabase)는 관여 안 함
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 등록 실패 시 앱 동작에 영향 없음 (graceful degradation)
    });
  });
}
