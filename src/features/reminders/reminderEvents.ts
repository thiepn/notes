import { dispatchAppEvent } from '../../app/events';

export function dispatchReminderChanged(): void {
  dispatchAppEvent('remindersChanged');
}
