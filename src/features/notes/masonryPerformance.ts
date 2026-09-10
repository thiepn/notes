import { resolveShellViewport, type ShellViewport } from '../../app/shellLayout';

export const INITIAL_MOUNTED_NOTE_COUNT = 96;
export const NOTE_MOUNT_BATCH_SIZE = 96;
export const MOBILE_INITIAL_MOUNTED_NOTE_COUNT = 48;
export const MOBILE_NOTE_MOUNT_BATCH_SIZE = 48;
export const TABLET_INITIAL_MOUNTED_NOTE_COUNT = 72;
export const TABLET_NOTE_MOUNT_BATCH_SIZE = 72;

export interface NoteMountProfile {
  name: ShellViewport;
  initial: number;
  batch: number;
  rootMargin: string;
}

const NOTE_MOUNT_PROFILES: Record<ShellViewport, NoteMountProfile> = {
  mobile: {
    name: 'mobile',
    initial: MOBILE_INITIAL_MOUNTED_NOTE_COUNT,
    batch: MOBILE_NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '480px 0px',
  },
  tablet: {
    name: 'tablet',
    initial: TABLET_INITIAL_MOUNTED_NOTE_COUNT,
    batch: TABLET_NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '640px 0px',
  },
  desktop: {
    name: 'desktop',
    initial: INITIAL_MOUNTED_NOTE_COUNT,
    batch: NOTE_MOUNT_BATCH_SIZE,
    rootMargin: '800px 0px',
  },
};

export function resolveNoteMountProfile(width: number): NoteMountProfile {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1101;
  return NOTE_MOUNT_PROFILES[resolveShellViewport(safeWidth)];
}
