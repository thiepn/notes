import { useEffect, useState } from 'react';
import { BellRing, ShieldAlert } from 'lucide-react';

export function ReminderNotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const handleFocus = () => {
      setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  if (permission === 'granted') {
    return (
      <div className="reminder-notification-banner" data-state="granted">
        <BellRing aria-hidden="true" />
        <div>
          <strong>Notifications enabled</strong>
          <span>Due reminders can alert you while Notes is running or when you return to it.</span>
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="reminder-notification-banner" data-state="blocked">
        <ShieldAlert aria-hidden="true" />
        <div>
          <strong>Notifications blocked</strong>
          <span>
            Enable notifications for this site in your browser settings if you want local alerts.
          </span>
        </div>
      </div>
    );
  }

  if (permission === 'unsupported') {
    return (
      <div className="reminder-notification-banner" data-state="unsupported">
        <BellRing aria-hidden="true" />
        <div>
          <strong>Browser notifications unavailable</strong>
          <span>Reminders still appear in Notes and remain fully usable offline.</span>
        </div>
      </div>
    );
  }

  const request = async () => {
    setRequesting(true);
    try {
      setPermission(await Notification.requestPermission());
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="reminder-notification-banner" data-state="available">
      <BellRing aria-hidden="true" />
      <div>
        <strong>Optional local notifications</strong>
        <span>Permission is requested only when you choose to enable it.</span>
      </div>
      <button type="button" disabled={requesting} onClick={() => void request()}>
        {requesting ? 'Requesting…' : 'Enable notifications'}
      </button>
    </div>
  );
}
