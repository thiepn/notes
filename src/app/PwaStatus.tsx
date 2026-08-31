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

export function PwaStatus() {
  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
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
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);

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

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  const update = async () => {
    const updateServiceWorker = updateServiceWorkerRef.current;
    if (!updateServiceWorker) return;
    setNeedRefresh(false);
    await updateServiceWorker(true);
  };

  if (!online) {
    return (
      <aside className="pwa-status pwa-status-offline" role="status" aria-live="polite">
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
      <aside className="pwa-status" role="status" aria-live="polite">
        <RefreshCw aria-hidden="true" />
        <span>
          <strong>Update available</strong>
          <small>Reload when you are ready to use the latest version.</small>
        </span>
        <button className="pwa-status-primary" type="button" onClick={() => void update()}>
          Reload
        </button>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss update"
          onClick={() => setNeedRefresh(false)}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  if (installPrompt) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite">
        <Download aria-hidden="true" />
        <span>
          <strong>Install Notes</strong>
          <small>Open it like an app and keep it ready offline.</small>
        </span>
        <button className="pwa-status-primary" type="button" onClick={() => void install()}>
          Install
        </button>
        <button
          className="pwa-status-dismiss"
          type="button"
          aria-label="Dismiss install prompt"
          onClick={() => setInstallPrompt(null)}
        >
          <X aria-hidden="true" />
        </button>
      </aside>
    );
  }

  if (offlineReady) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite">
        <span>
          <strong>Ready offline</strong>
          <small>Notes can now reopen without a network connection.</small>
        </span>
      </aside>
    );
  }

  if (registrationFailed) {
    return (
      <aside className="pwa-status" role="status" aria-live="polite">
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
