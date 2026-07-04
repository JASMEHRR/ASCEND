import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { DialogProvider } from './context/DialogContext';
import { LaunchStateProvider } from './features/launch/LaunchStateContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LaunchStateProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </LaunchStateProvider>
    </AuthProvider>
  </StrictMode>,
);
