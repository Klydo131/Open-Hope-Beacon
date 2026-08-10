'use client';

// Sharing via the device's own share sheet (Web Share API). The file goes
// straight from the user's device to whatever they pick — WhatsApp, Messenger,
// Telegram, or another device nearby (AirDrop / Nearby Share / Bluetooth). No
// server, no hosting: Beacon is a bridge. Falls back to copying a link where the
// Web Share API isn't available (most desktops).

export type ShareResult = 'shared' | 'copied' | 'download' | 'cancelled' | 'unsupported';

export function blobToFile(blob: Blob, name: string, mime?: string): File {
  return new File([blob], name, { type: mime || blob.type || 'application/octet-stream' });
}

// True when this browser can share actual files (mobile Safari/Chrome, etc.).
export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
  if (!n.share) return false;
  if (file) return !!n.canShare && n.canShare({ files: [file] });
  return true;
}

export async function shareItem(opts: {
  title: string;
  text?: string;
  file?: File;
  url?: string;
}): Promise<ShareResult> {
  const n =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { canShare?: (d?: ShareData) => boolean })
      : undefined;

  // 1) Share the actual file through the OS share sheet, if supported.
  if (n?.share && opts.file && n.canShare?.({ files: [opts.file] })) {
    try {
      await n.share({ files: [opts.file], title: opts.title, text: opts.text });
      return 'shared';
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }

  // 2) Share a link/text (e.g. for link items, or where file share is absent).
  if (n?.share && (opts.url || opts.text)) {
    try {
      await n.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (e) {
      return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }

  // 3) Fallback: copy a link to the clipboard so the user can paste it anywhere.
  if (opts.url) {
    try {
      await navigator.clipboard.writeText(opts.url);
      return 'copied';
    } catch {
      return 'unsupported';
    }
  }

  // 4) No file-share and no link → the caller should offer Download instead.
  return 'download';
}
