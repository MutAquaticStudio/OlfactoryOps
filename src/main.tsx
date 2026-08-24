import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/features.css'
import App from './App.tsx'

const immutableReleaseSha = import.meta.env.VITE_RELEASE_SHA

if (import.meta.env.PROD && /^[a-f0-9]{40}$/.test(immutableReleaseSha ?? '') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const reloadKey = 'olfactoryops.service-worker-reloaded'
    const hadExistingController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A first visit receives its initial controller here. Only refresh a tab that
      // was already controlled, so a cache upgrade is invisible to new visitors.
      if (!hadExistingController || reloading || window.sessionStorage.getItem(reloadKey) === '1') return
      reloading = true
      window.sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
    })
    void navigator.serviceWorker.register(`/sw.js?release=${immutableReleaseSha}`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
