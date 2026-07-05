import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>,
);
