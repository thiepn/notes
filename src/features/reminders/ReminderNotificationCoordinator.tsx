import { useEffect } from 'react';

import { NotesRepository, RemindersRepository, notesDatabase } from '../../db';
import { usePrivacy } from '../privacy/PrivacyContext';
import { privacyNotificationCopy } from '../privacy/privacy';
import { dispatchReminderChanged } from './reminderEvents';

const remindersRepository = new RemindersRepository(notesDatabase);
const notesRepository = new NotesRepository(notesDatabase);
const CHECK_INTERVAL_MS = 60_000;

export function ReminderNotificationCoordinator() {
  const { privateNotifications, locked } = usePrivacy();

  useEffect(() => {
    let checking = false;

    const checkDue = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      checking = true;
      try {
        const due = await remindersRepository.dueForNotification();
        for (const reminder of due) {
          const note = await notesRepository.get(reminder.noteId);
          if (!note || note.trashedAt !== null) continue;
          const copy = privacyNotificationCopy(note, privateNotifications || locked);
          const shown = await showLocalNotification(copy.title, copy.body, reminder.noteId);
          if (shown) {
            await remindersRepository.markNotified(reminder.noteId);
            dispatchReminderChanged();
          }
        }
      } catch {
        // Reminder checks are best effort. Reminder records remain active if notification delivery fails.
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(() => void checkDue(), CHECK_INTERVAL_MS);
    const handleFocus = () => void checkDue();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkDue();
    };
    const handleReminderChanged = () => void checkDue();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('notes-reminders-changed', handleReminderChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    void checkDue();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('notes-reminders-changed', handleReminderChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [locked, privateNotifications]);

  return null;
}

async function showLocalNotification(
  title: string,
  body: string,
  noteId: string,
): Promise<boolean> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/notes/');
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag: `notes-reminder:${noteId}`,
          icon: '/notes/pwa-192x192.png',
          badge: '/notes/pwa-192x192.png',
        });
        return true;
      }
    }

    new Notification(title, { body, tag: `notes-reminder:${noteId}` });
    return true;
  } catch {
    return false;
  }
}
