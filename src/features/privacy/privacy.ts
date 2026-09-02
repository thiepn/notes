export const PRIVACY_PREFERENCES_KEY = 'notes.privacy.preferences.v1';
export const PRIVACY_CREDENTIAL_KEY = 'notes.privacy.credential.v1';

export const PRIVACY_LOCK_ITERATIONS = 120_000;
export const PRIVACY_MIN_PASSCODE_LENGTH = 4;
export const PRIVACY_MAX_PASSCODE_LENGTH = 128;

export interface PrivacyPreferences {
  hidePreviews: boolean;
  privateNotifications: boolean;
  autoLockMinutes: number | null;
}

export interface PrivacyCredential {
  version: 1;
  salt: string;
  hash: string;
  iterations: number;
}

export interface PrivacyNotificationSource {
  title: string;
  content: string;
}

export interface PrivacyNotificationCopy {
  title: string;
  body: string;
}

export const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  hidePreviews: false,
  privateNotifications: true,
  autoLockMinutes: 5,
};

const ALLOWED_AUTO_LOCK_MINUTES = new Set<number | null>([null, 0, 1, 5, 15, 30]);

export function normalizePrivacyPreferences(value: unknown): PrivacyPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PRIVACY_PREFERENCES };
  const record = value as Partial<PrivacyPreferences>;
  return {
    hidePreviews:
      typeof record.hidePreviews === 'boolean'
        ? record.hidePreviews
        : DEFAULT_PRIVACY_PREFERENCES.hidePreviews,
    privateNotifications:
      typeof record.privateNotifications === 'boolean'
        ? record.privateNotifications
        : DEFAULT_PRIVACY_PREFERENCES.privateNotifications,
    autoLockMinutes: ALLOWED_AUTO_LOCK_MINUTES.has(record.autoLockMinutes ?? null)
      ? (record.autoLockMinutes ?? null)
      : DEFAULT_PRIVACY_PREFERENCES.autoLockMinutes,
  };
}

export function readPrivacyPreferences(): PrivacyPreferences {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_PRIVACY_PREFERENCES };
  try {
    const raw = storage.getItem(PRIVACY_PREFERENCES_KEY);
    return raw ? normalizePrivacyPreferences(JSON.parse(raw)) : { ...DEFAULT_PRIVACY_PREFERENCES };
  } catch {
    return { ...DEFAULT_PRIVACY_PREFERENCES };
  }
}

export function writePrivacyPreferences(preferences: PrivacyPreferences): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(normalizePrivacyPreferences(preferences)));
}

export function readPrivacyCredential(): PrivacyCredential | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRIVACY_CREDENTIAL_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PrivacyCredential>;
    if (
      value.version !== 1 ||
      typeof value.salt !== 'string' ||
      !/^[0-9a-f]{32}$/u.test(value.salt) ||
      typeof value.hash !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.hash) ||
      typeof value.iterations !== 'number' ||
      !Number.isInteger(value.iterations) ||
      value.iterations < 10_000
    ) {
      return null;
    }
    return {
      version: 1,
      salt: value.salt,
      hash: value.hash,
      iterations: value.iterations,
    };
  } catch {
    return null;
  }
}

export function writePrivacyCredential(credential: PrivacyCredential): void {
  getStorage()?.setItem(PRIVACY_CREDENTIAL_KEY, JSON.stringify(credential));
}

export function clearPrivacyCredential(): void {
  getStorage()?.removeItem(PRIVACY_CREDENTIAL_KEY);
}

export function supportsPrivacyLock(): boolean {
  return Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
}

export function validatePrivacyPasscode(passcode: string): string | null {
  if (passcode.length < PRIVACY_MIN_PASSCODE_LENGTH) {
    return `Use at least ${PRIVACY_MIN_PASSCODE_LENGTH} characters.`;
  }
  if (passcode.length > PRIVACY_MAX_PASSCODE_LENGTH) {
    return `Use no more than ${PRIVACY_MAX_PASSCODE_LENGTH} characters.`;
  }
  return null;
}

export async function createPrivacyCredential(passcode: string): Promise<PrivacyCredential> {
  const validation = validatePrivacyPasscode(passcode);
  if (validation) throw new Error(validation);
  if (!supportsPrivacyLock()) throw new Error('Privacy lock is not supported in this browser.');

  const saltBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);
  const hash = await derivePrivacyHash(passcode, salt, PRIVACY_LOCK_ITERATIONS);
  return { version: 1, salt, hash, iterations: PRIVACY_LOCK_ITERATIONS };
}

export async function verifyPrivacyPasscode(
  passcode: string,
  credential: PrivacyCredential,
): Promise<boolean> {
  if (!supportsPrivacyLock()) return false;
  const candidate = await derivePrivacyHash(passcode, credential.salt, credential.iterations);
  return constantTimeHexEqual(candidate, credential.hash);
}

export function privacyAutoLockDelayMs(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.max(0, minutes) * 60_000;
}

export function privacyNotificationCopy(
  note: PrivacyNotificationSource,
  redact: boolean,
): PrivacyNotificationCopy {
  if (redact) {
    return {
      title: 'Notes reminder',
      body: 'Open Notes to view this reminder.',
    };
  }

  return {
    title: note.title.trim() || 'Notes reminder',
    body: note.content.trim().slice(0, 180) || 'Open Notes to view this reminder.',
  };
}

async function derivePrivacyHash(
  passcode: string,
  saltHex: string,
  iterations: number,
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
