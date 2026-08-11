'use client';

// On-device media storage. Files never leave the browser.

import type { MaterialType } from './types';

const DB_NAME = 'beacon-media';
const META = 'meta';
const BLOBS = 'blobs';
const VERSION = 1;

export type MediaType = MaterialType;
export type PlayableMediaType = 'audio' | 'video';

export interface MediaMeta {
  id: string;
  title: string;
  type: MediaType;
  note?: string;
  external_url?: string;
  mime?: string;
  size: number;
  created_at: string;
  width?: number;
  height?: number;
  duration?: number;
}

export class LocalMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalMediaError';
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        let result!: T;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => { db.close(); resolve(result); };
        transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      }),
  );
}

export function typeFromMime(mime: string): MediaType {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'pdf';
}

export function newMediaId(): string {
  // randomUUID is a SECURE-CONTEXT api. It is undefined over plain http on a
  // LAN address — exactly how a church would try this on its own machine
  // first — and absent in Safari before 15.4. Unguarded, it does not degrade:
  // it throws, and attaching a file fails outright on those devices.
  //
  // The fallback does not need to be cryptographically strong. This id names a
  // row and a key in the caller's own IndexedDB; it is not a secret and it is
  // never a permission.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolutionLabel(width?: number, height?: number): string {
  if (!width || !height) return '';
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const tier = long >= 3840 && short >= 2160
    ? '4K'
    : long >= 1920 && short >= 1080
      ? '1080p'
      : long >= 1280 && short >= 720
        ? 'HD'
        : '';
  return `${tier ? `${tier} · ` : ''}${width}×${height}`;
}

export async function prepareMediaStorage(bytes: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage) return;
  try { await navigator.storage.persist?.(); } catch {}
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (
      typeof quota === 'number' &&
      typeof usage === 'number' &&
      bytes > Math.max(0, quota - usage - 1024 * 1024)
    ) {
      throw new LocalMediaError(
        'Not enough device storage. Free some space or choose a smaller file.',
      );
    }
  } catch (error) {
    if (error instanceof LocalMediaError) throw error;
    // Estimates are optional; the atomic IndexedDB write is authoritative.
  }
}

export function inspectPlayableMedia(
  file: File,
  expected: PlayableMediaType,
): Promise<Pick<MediaMeta, 'width' | 'height' | 'duration'>> {
  return new Promise((resolve, reject) => {
    const media = document.createElement('video');
    const url = URL.createObjectURL(file);
    let metadata: Pick<MediaMeta, 'width' | 'height' | 'duration'> = {};
    let settled = false;
    const message = expected === 'video'
      ? 'This video cannot play here. Try an MP4 with H.264 video and AAC audio.'
      : 'This audio cannot play here. Try MP3, M4A, or WAV.';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      media.onloadedmetadata = null;
      media.oncanplay = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(metadata);
    };
    const timer = setTimeout(() => finish(new LocalMediaError(message)), 20_000);
    media.preload = 'auto';
    media.muted = true;
    media.onloadedmetadata = () => {
      if (expected === 'video' && (!media.videoWidth || !media.videoHeight)) {
        finish(new LocalMediaError(message));
        return;
      }
      metadata = {
        ...(media.videoWidth && media.videoHeight
          ? { width: media.videoWidth, height: media.videoHeight }
          : {}),
        ...(Number.isFinite(media.duration) && media.duration > 0
          ? { duration: media.duration }
          : {}),
      };
    };
    media.oncanplay = () => finish();
    media.onerror = () => finish(new LocalMediaError(message));
    media.src = url;
    media.load();
  });
}

// Metadata and bytes commit together, so a quota failure cannot leave a ghost.
export async function putMedia(meta: MediaMeta, blob?: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(blob ? [META, BLOBS] : [META], 'readwrite');
    transaction.objectStore(META).put(meta);
    if (blob) transaction.objectStore(BLOBS).put(blob, meta.id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function listMedia(): Promise<MediaMeta[]> {
  const all = await tx<MediaMeta[]>(META, 'readonly', (store) => store.getAll());
  return (all ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(BLOBS, 'readonly', (store) => store.get(id));
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META, BLOBS], 'readwrite');
    transaction.objectStore(META).delete(id);
    transaction.objectStore(BLOBS).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export function humanSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
