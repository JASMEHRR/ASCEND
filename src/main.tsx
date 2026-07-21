import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { DialogProvider } from './context/DialogContext';
import { LaunchStateProvider } from './features/launch/LaunchStateContext';
import { JarvisProvider } from './features/jarvis/engine/JarvisProvider';
import { ObsidianProvider } from './features/obsidian/ObsidianContext';
import { RemindersProvider } from './features/reminders/RemindersContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LaunchStateProvider>
        <DialogProvider>
          <ObsidianProvider>
            <RemindersProvider>
              <JarvisProvider>
                <App />
              </JarvisProvider>
            </RemindersProvider>
          </ObsidianProvider>
        </DialogProvider>
      </LaunchStateProvider>
    </AuthProvider>
  </StrictMode>,
);
