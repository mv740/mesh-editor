import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

import './style.css' // Import your existing CSS file

createRoot(document.querySelector('#app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
