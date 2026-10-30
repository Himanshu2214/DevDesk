import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/smoothui.css';
import './styles/app.css';
import './styles/app2.css';
import './styles/react.css';
import './styles/motion.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// installable app (standalone build): register the service worker once the page has loaded
if (import.meta.env.PROD && import.meta.env.VITE_BACKEND === 'supabase' && 'serviceWorker' in navigator)
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* not critical */ }) });
