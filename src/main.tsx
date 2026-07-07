import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { LaunchStateProvider } from './features/launch/LaunchStateContext';
import { JarvisProvider } from './features/jarvis/engine/JarvisProvider';
import { ObsidianProvider } from './features/obsidian/ObsidianContext';
import { KiteProvider } from './features/kite/KiteContext';
import { GoogleProvider } from './features/google/GoogleContext';
import { PlanningProvider } from './features/planning/PlanningContext';
import './index.css';

// Register the PWA service worker (offline shell). Best-effort — a failure
// (unsupported browser, blocked SW) must never break app startup.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <LaunchStateProvider>
        <DialogProvider>
          <ObsidianProvider>
            <KiteProvider>
              <GoogleProvider>
                <JarvisProvider>
                  <PlanningProvider>
                    <App />
                  </PlanningProvider>
                </JarvisProvider>
              </GoogleProvider>
            </KiteProvider>
          </ObsidianProvider>
        </DialogProvider>
          </LaunchStateProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
