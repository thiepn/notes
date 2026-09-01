export interface LocalReminderInput {
  date: string;
  time: string;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function localInputFromTimestamp(timestamp: number): LocalReminderInput {
  const date = new Date(timestamp);
  return {
    date: `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
    time: `${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`,
  };
}

export function parseLocalReminderInput(input: LocalReminderInput): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input.date.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(input.time.trim());
  if (!dateMatch || !timeMatch) throw new Error('Choose both a reminder date and time.');

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) throw new Error('Choose a valid reminder time.');

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Choose a valid reminder date.');
  }
  if (date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error('That local time does not exist because of a daylight-saving time change.');
  }
  return date.getTime();
}

export function defaultReminderTimestamp(now = Date.now()): number {
  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15);
  if (date.getTime() <= now) date.setMinutes(date.getMinutes() + 15);
  return date.getTime();
}

export function applyReminderDatePreset(
  current: LocalReminderInput,
  daysFromToday: number,
  now = Date.now(),
): LocalReminderInput {
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromToday);
  const parts = localInputFromTimestamp(date.getTime());
  return { date: parts.date, time: current.time };
}

export function isSameLocalDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function formatReminderDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatReminderShort(timestamp: number, now = Date.now()): string {
  if (isSameLocalDay(timestamp, now)) {
    return `Today, ${new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameLocalDay(timestamp, tomorrow.getTime())) {
    return `Tomorrow, ${new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
