import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level error boundary. Catches render/runtime errors anywhere below it and
 * shows a recovery screen instead of a blank page. "Clear local cache & reload"
 * wipes Ascend's localStorage keys — the usual culprit behind a corrupt-state crash.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private clearCacheAndReload = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('ascend_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#02040a] text-white/95 p-6">
        <div className="liquid-glass-panel rounded-[2rem] p-10 max-w-md w-full flex flex-col items-center gap-6 text-center">
          <p className="text-lg font-bold tracking-tight">Something went wrong</p>
          <p className="text-sm text-white/50 leading-relaxed">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening,
            clearing the local cache resets your device-side state.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => location.reload()}
              className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-black font-bold uppercase tracking-wider text-[11px] transition-all active:scale-95"
            >
              Reload
            </button>
            <button
              onClick={this.clearCacheAndReload}
              className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold uppercase tracking-wider text-[11px] transition-all active:scale-95"
            >
              Clear local cache &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
