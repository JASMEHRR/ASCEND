import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DialogProvider } from './context/DialogContext';
import { LaunchStateProvider } from './features/launch/LaunchStateContext';
import { JarvisProvider } from './features/jarvis/engine/JarvisProvider';
import { ObsidianProvider } from './features/obsidian/ObsidianContext';
import { GoogleProvider } from './features/google/GoogleContext';
import { PlanningProvider } from './features/planning/PlanningContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LaunchStateProvider>
        <DialogProvider>
          <ObsidianProvider>
            <GoogleProvider>
              <JarvisProvider>
                <PlanningProvider>
                  <App />
                </PlanningProvider>
              </JarvisProvider>
            </GoogleProvider>
          </ObsidianProvider>
        </DialogProvider>
        </LaunchStateProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
