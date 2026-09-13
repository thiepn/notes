import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

const INSTALL_DISMISSED_KEY = 'notes.pwa.install-dismissed';

function installPromptDismissed(): boolean {
  try {
    return sessionStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberInstallPromptDismissal(): void {
  try {
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Session storage is optional convenience state; installation still works without it.
  }
}

function clearInstallPromptDismissal(): void {
  try {
    sessionStorage.removeItem(INSTALL_DISMISSED_KEY);
  } catch {
    // Ignore storage restrictions; the installed event still clears in-memory state.
  }
}

export function PwaStatus() {
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateFailed(false);
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
        if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
        readyTimerRef.current = window.setTimeout(() => setOfflineReady(false), 6000);
      },
      onRegisterError() {
        setRegistrationFailed(true);
      },
    });

    return () => {
      if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleBeforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      if (installPromptDismissed()) return;
      setInstallFailed(false);
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      clearInstallPromptDismissal();
      setInstallFailed(false);
      setInstallPrompt(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismissInstall = () => {
    rememberInstallPromptDismissal();
    setInstallPrompt(null);
  };

  const install = async () => {
    if (!installPrompt || installBusy) return;
    setInstallBusy(true);
    setInstallFailed(false);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') clearInstallPromptDismissal();
      else rememberInstallPromptDismissal();
    } catch {
      setInstallPrompt(null);
      setInstallFailed(true);
    } finally {
      setInstallBusy(false);
    }
  };

  const update = async () => {
    const updateServiceWorker = updateServiceWorkerRef.current;
    if (!updateServiceWorker || updateBusy) return;
    setUpdateBusy(true);
    setUpdateFailed(false);
    try {
      await updateServiceWorker(true);
      setNeedRefresh(false);
    } catch {
      setUpdateFailed(true);
      setNeedRefresh(true);
    } finally {
      setUpdateBusy(false);
    }
  };

  if (!online) {
    return (
      <aside
        className="pwa-status pwa-status-offline"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <WifiOff aria-hidden="true" />
        <span>
          <strong>Offline</strong>
          <small>Your notes stay available on this device.</small>
        </span>
      </aside>
    );
  }

  if (needRefresh) {
    return (
      <aside
        className="pwa-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={updateBusy}
      >
        <RefreshCw aria-hidden="true" />
        <span>
          <strong>{updateFailed ? 'Update interrupted' : 'Update available'}</strong>
          <small>
            {updateFailed
              ? 'The update could not be applied. Check your connection and try again.'
              : 'Reload when you are ready to use the latest version.'}
          </small>
        </span>
        <button
          className="pwa-status-primary"
          type="button"
          disabled={updateBusy}
          onClick={() => void update()}
        >
          {updateBusy ? 'Updating…' : updateFailed ? 'Retry' : 'Reload'}
        </button>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss update"
          disabled={updateBusy}
          onClick={() => setNeedRefresh(false)}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  if (installPrompt) {
    return (
      <aside
        className="pwa-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={installBusy}
      >
        <Download aria-hidden="true" />
        <span>
          <strong>Install Notes</strong>
          <small>Open it like an app and keep it ready offline.</small>
        </span>
        <button
          className="pwa-status-primary"
          type="button"
          disabled={installBusy}
          onClick={() => void install()}
        >
          {installBusy ? 'Installing…' : 'Install'}
        </button>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss install prompt"
          disabled={installBusy}
          onClick={dismissInstall}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  if (installFailed) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite" aria-atomic="true">
        <Download aria-hidden="true" />
        <span>
          <strong>Install unavailable</strong>
          <small>Use your browser's install or Add to Home screen action if available.</small>
        </span>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss install warning"
          onClick={() => setInstallFailed(false)}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  if (offlineReady) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite" aria-atomic="true">
        <span>
          <strong>Ready offline</strong>
          <small>Notes can now reopen without a network connection.</small>
        </span>
      </aside>
    );
  }

  if (registrationFailed) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite" aria-atomic="true">
        <span>
          <strong>Offline setup unavailable</strong>
          <small>Notes still works locally while this page remains open.</small>
        </span>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss offline setup warning"
          onClick={() => setRegistrationFailed(false)}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return null;
}
