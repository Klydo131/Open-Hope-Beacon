'use client';

import { useEffect, useState } from 'react';
import { getBlob, humanSize } from '@/lib/localMedia';
import type { PairingMedia } from '@/lib/types';

// One attachment in a conversation.
//
// The bytes are not in the row, so this component fetches them from IndexedDB
// and makes an object URL. Object URLs are a memory leak by default — the
// browser holds the blob alive until the URL is revoked, and a scrolling thread
// creates one per attachment — so the cleanup in the effect below is not
// housekeeping, it is the difference between a chat you can leave open and one
// that grows until the tab is killed.
export function Attachment({
  media,
  onRemove,
}: {
  media: PairingMedia;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    getBlob(media.id)
      .then((blob) => {
        if (revoked) return;
        if (!blob) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setMissing(true);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media.id]);

  // The row exists and the file does not. Say so plainly rather than showing a
  // broken image: this is what a failed write or cleared storage looks like,
  // and a person needs to know the file is gone, not that the app is confused.
  if (missing) {
    return (
      <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-500">
        {media.title} · file not on this device
      </div>
    );
  }

  const caption = (
    <span className="mt-1 block text-xs text-gray-400">
      {media.title} · {humanSize(media.size)}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-2 font-semibold text-red-700 underline hover:text-red-800"
        >
          Remove
        </button>
      )}
    </span>
  );

  if (!url) {
    return <div className="h-16 w-40 animate-pulse rounded-xl bg-gray-100" />;
  }

  if (media.kind === 'image') {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={media.title}
          className="max-h-56 rounded-xl object-cover"
        />
        {caption}
      </div>
    );
  }

  if (media.kind === 'audio') {
    return (
      <div>
        <audio controls src={url} className="w-56" />
        {caption}
      </div>
    );
  }

  if (media.kind === 'video') {
    return (
      <div>
        {/* playsInline is not decoration. Without it iOS Safari takes a video
            out of the page and plays it fullscreen, which throws the person out
            of the conversation they were reading. Both other players in this
            repo set it; this one did not, and that is an iPhone-only bug that
            no amount of desktop testing would show. preload="metadata" keeps a
            long video off somebody's mobile data until they press play. */}
        <video
          controls
          playsInline
          preload="metadata"
          src={url}
          className="max-h-56 rounded-xl"
        />
        {caption}
      </div>
    );
  }

  return (
    <div>
      <a
        href={url}
        download={media.title}
        className="inline-block rounded-xl bg-gray-100 px-3 py-2 text-sm underline"
      >
        {media.title}
      </a>
      {caption}
    </div>
  );
}
