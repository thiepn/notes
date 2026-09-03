import { useCallback, useEffect, useState } from 'react';
import { HardDrive, ShieldCheck } from 'lucide-react';

import {
  formatStorageBytes,
  readStorageHealth,
  requestPersistentStorage,
  type StorageHealth,
} from './storageHealth';

export function StorageHealthSettings() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    setHealth(await readStorageHealth());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const protect = async () => {
    setRequesting(true);
    try {
      setHealth(await requestPersistentStorage());
    } finally {
      setRequesting(false);
    }
  };

  const persistenceCopy =
    health?.persistence === 'persistent'
      ? 'Persistent storage granted. The browser should not evict Notes automatically under storage pressure.'
      : health?.persistence === 'best-effort'
        ? 'Best-effort storage. The browser may evict local data under storage pressure.'
        : 'This browser does not expose persistent-storage status.';
  const usageCopy = health
    ? `${formatStorageBytes(health.usageBytes)} used${
        health.quotaBytes === null ? '' : ` of about ${formatStorageBytes(health.quotaBytes)}`
      }.`
    : 'Checking browser storage…';

  return (
    <section className="settings-group" aria-label="Local storage health">
      <div className="settings-group-copy">
        <strong>Local storage health</strong>
        <span>Notes is local-first, so browser-storage durability is part of data safety.</span>
      </div>
      <div className="settings-setting-row">
        <span className="settings-row-icon" aria-hidden="true">
          {health?.persistence === 'persistent' ? <ShieldCheck /> : <HardDrive />}
        </span>
        <span>
          <strong>
            {health?.persistence === 'persistent'
              ? 'Persistent local storage'
              : health?.persistence === 'best-effort'
                ? 'Best-effort local storage'
                : 'Local browser storage'}
          </strong>
          <small>{persistenceCopy}</small>
          <small>{usageCopy}</small>
        </span>
        {health?.canRequestPersistence ? (
          <button type="button" disabled={requesting} onClick={() => void protect()}>
            {requesting ? 'Requesting…' : 'Protect storage'}
          </button>
        ) : (
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        )}
      </div>
      <p className="settings-note">
        Persistent storage reduces automatic browser eviction; it does not prevent manual
        browser-data clearing. Keep full backups for disaster recovery.
      </p>
    </section>
  );
}
