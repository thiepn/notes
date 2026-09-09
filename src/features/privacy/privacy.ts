export const PRIVACY_PREFERENCES_KEY = 'notes.privacy.preferences.v1';
export const PRIVACY_CREDENTIAL_KEY = 'notes.privacy.credential.v1';
export const PRIVACY_ATTEMPT_KEY = 'notes.privacy.attempts.v1';
export const PRIVACY_LOCK_SIGNAL_KEY = 'notes.privacy.lock-signal.v1';

export const PRIVACY_LOCK_ITERATIONS = 600_000;
export const PRIVACY_MIN_PASSCODE_LENGTH = 4;
export const PRIVACY_MAX_PASSCODE_LENGTH = 128;
export const PRIVACY_ATTEMPT_RESET_MS = 15 * 60_000;
export const PRIVACY_MAX_UNLOCK_DELAY_MS = 60_000;

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

export interface PrivacyAttemptState {
  version: 1;
  failures: number;
  lastFailureAt: number;
  blockedUntil: number;
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
  storage.setItem(
    PRIVACY_PREFERENCES_KEY,
    JSON.stringify(normalizePrivacyPreferences(preferences)),
  );
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
      value.iterations < 10_000 ||
      value.iterations > 10_000_000
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

export function privacyCredentialNeedsUpgrade(credential: PrivacyCredential): boolean {
  return credential.iterations < PRIVACY_LOCK_ITERATIONS;
}

export function readPrivacyAttemptState(now = Date.now()): PrivacyAttemptState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRIVACY_ATTEMPT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PrivacyAttemptState>;
    if (
      value.version !== 1 ||
      typeof value.failures !== 'number' ||
      !Number.isSafeInteger(value.failures) ||
      value.failures < 1 ||
      value.failures > 1_000 ||
      typeof value.lastFailureAt !== 'number' ||
      !Number.isSafeInteger(value.lastFailureAt) ||
      value.lastFailureAt < 0 ||
      typeof value.blockedUntil !== 'number' ||
      !Number.isSafeInteger(value.blockedUntil) ||
      value.blockedUntil < value.lastFailureAt ||
      value.blockedUntil > value.lastFailureAt + PRIVACY_MAX_UNLOCK_DELAY_MS
    ) {
      return null;
    }
    if (now - value.lastFailureAt >= PRIVACY_ATTEMPT_RESET_MS) return null;
    return {
      version: 1,
      failures: value.failures,
      lastFailureAt: value.lastFailureAt,
      blockedUntil: value.blockedUntil,
    };
  } catch {
    return null;
  }
}

export function privacyUnlockDelayMs(failures: number): number {
  if (failures < 3) return 0;
  if (failures === 3) return 2_000;
  if (failures === 4) return 5_000;
  if (failures === 5) return 15_000;
  if (failures === 6) return 30_000;
  return PRIVACY_MAX_UNLOCK_DELAY_MS;
}

export function registerPrivacyUnlockFailure(now = Date.now()): PrivacyAttemptState {
  const previous = readPrivacyAttemptState(now);
  const failures = (previous?.failures ?? 0) + 1;
  const state: PrivacyAttemptState = {
    version: 1,
    failures,
    lastFailureAt: now,
    blockedUntil: now + privacyUnlockDelayMs(failures),
  };
  getStorage()?.setItem(PRIVACY_ATTEMPT_KEY, JSON.stringify(state));
  return state;
}

export function clearPrivacyUnlockFailures(): void {
  getStorage()?.removeItem(PRIVACY_ATTEMPT_KEY);
}

export function broadcastPrivacyLock(): void {
  const storage = getStorage();
  if (!storage) return;
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;
  storage.setItem(
    PRIVACY_LOCK_SIGNAL_KEY,
    JSON.stringify({ version: 1, id: randomPart, requestedAt: Date.now() }),
  );
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
      salt: hexToArrayBuffer(saltHex),
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

function hexToArrayBuffer(value: string): ArrayBuffer {
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return buffer;
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
