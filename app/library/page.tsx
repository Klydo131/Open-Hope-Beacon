'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, EmptyState } from '@/components/ui';
import { NAVY } from '@/lib/brand';
import { downloadBlob } from '@/lib/pdf';
import { safeExternalUrl } from '@/lib/url';
import { videoEmbed } from '@/lib/video';
import {
  listMedia,
  putMedia,
  getBlob,
  deleteMedia,
  humanSize,
  newMediaId,
  resolutionLabel,
  type MediaMeta,
} from '@/lib/localMedia';
import { shareItem, blobToFile } from '@/lib/share';
import { ShareButton } from '@/components/ShareSheet';
import { MediaPlayer } from '@/components/MediaPlayer';
import { Playlists } from '@/components/Playlists';
import { PlayerPanel } from '@/components/PlayerBar';
import { useRoom } from '@/lib/room-theme';
import { saveFilesFromInput, savedMessage } from '@/lib/save-media';
import { useDemo } from '@/lib/demo/store';
import { homeFor, useLiveSession } from '@/lib/live/session';
import { STARTER_KIT, KIT_TOPICS } from '@/lib/starter-kit';

const ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};

// A personal, on-device media library. Everything is saved locally (IndexedDB)
// and shared straight from the device — Beacon never hosts the files.
const DEMO_HOME: Record<string, string> = {
  executive: '/admin', admin: '/admin', dm: '/dm', ds: '/ds',
};

export default function LibraryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // This page uses the same room theme the rail
  // version gets from the shell.
  const { currentUser } = useDemo();
  const { theme } = useRoom(currentUser?.id ?? null, currentUser?.role ?? 'ds');

  // BACK GOES TO YOUR OWN HOME, not to '/'. On the live app '/' is the public
  // front door — the sign-in page — so a signed-in Director pressing Back
  // landed on a screen offering to sign them in, reading as if the app had
  // logged them out. It is only the right destination for somebody who is not
  // signed in at all.
  const { profile } = useLiveSession();
  const backHome = profile ? homeFor(profile.role) : currentUser ? DEMO_HOME[currentUser.role] : '/';

  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('All');

  const refresh = () => listMedia().then(setItems);

  useEffect(() => {
    listMedia()
      .then(setItems)
      .finally(() => setReady(true));
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ONE UPLOAD PATH IN THE APP. This used to be fifty lines here and the
    // player's Vault button would have needed its own copy — including the
    // WebKit fix that took a live Safari bug to find. It lives in
    // lib/save-media.ts now, and both buttons call it.
    setBusy(true);
    const result = await saveFilesFromInput(e.target, note);
    setBusy(false);
    if (result.saved > 0) {
      setNote('');
      await refresh();
    }
    const said = savedMessage(result);
    if (said) flash(said);
  };

  const addLink = async () => {
    const url = safeExternalUrl(linkUrl);
    if (!linkTitle.trim() || !url) {
      flash('Add a title and a valid https:// link.');
      return;
    }
    await putMedia({
      id: newMediaId(),
      title: linkTitle.trim(),
      type: 'link',
      note: note || undefined,
      external_url: url,
      size: 0,
      created_at: new Date().toISOString(),
    });
    setLinkTitle('');
    setLinkUrl('');
    setNote('');
    await refresh();
    flash('Link added');
  };

  const download = async (m: MediaMeta) => {
    const blob = await getBlob(m.id);
    if (!blob) {
      flash('This item has no file to download.');
      return;
    }
    downloadBlob(blob, m.title);
  };

  const share = async (m: MediaMeta) => {
    if (m.type === 'link' && m.external_url) {
      const res = await shareItem({ title: m.title, url: m.external_url });
      flash(res === 'copied' ? 'Link copied' : res === 'shared' ? 'Shared' : 'Nothing to share');
      return;
    }
    const blob = await getBlob(m.id);
    if (!blob) {
      flash('This item has no file to share.');
      return;
    }
    const res = await shareItem({
      title: m.title,
      text: m.title,
      file: blobToFile(blob, m.title, m.mime),
    });
    if (res === 'download') {
      // Web Share unavailable — fall back to a download the user can attach.
      downloadBlob(blob, m.title);
      flash('Sharing isn’t available here, so it downloaded instead. Attach it wherever you like.');
    } else {
      flash(res === 'shared' ? 'Shared' : res === 'cancelled' ? '' : 'Downloaded instead');
    }
  };

  const remove = async (m: MediaMeta) => {
    await deleteMedia(m.id);
    await refresh();
    flash('Removed from your device');
  };

  return (
    <div className="min-h-screen">
      <header className="text-white" style={{ backgroundColor: NAVY }}>
        {/* Back goes HOME, not back through history.
            router.back() walks the browser's own stack, and the entry before
            this one is very often the page you arrived from — which, if you
            opened the app from a link or a bookmark, is outside the app
            entirely. Pressing Back inside a product should never leave it. */}
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:max-w-5xl lg:max-w-6xl xl:max-w-7xl xl:px-8">
          <button
            onClick={() => router.push(backHome)}
            aria-label="Back to the app"
            className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
          >
            ← Back
          </button>
          <div className="flex-1">
            <p className="text-xl font-extrabold leading-tight">📚 My Library</p>
            <p className="text-xs text-white/60">Saved on this device · shared straight from it</p>
          </div>
        </div>
      </header>

      {/* Extra room at the top because components/BuildNotice.tsx floats a
          fixed band at top-[4.5rem], and this page has its own header rather
          than the app shell's. Without the clearance the notice lands exactly on
          the first heading. */}
      {/* WIDTH BY DEVICE, not one width squeezed onto all of them.
          max-w-3xl is 768px: right for a phone, and on a 1900px desktop it is
          a phone layout marooned in the middle of the screen with eleven
          hundred pixels of nothing either side. Reading prose wants a narrow
          column; a SHELF wants the room it has. This grows in steps, so a
          tablet gets a tablet's width and a desktop gets a desktop's. */}
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-6 pt-16 md:max-w-5xl lg:max-w-6xl xl:max-w-7xl xl:px-8">
        {/* THE FULL PLAYER LIVES HERE AND NOWHERE ELSE, AND IT GOES FIRST.

            It used to sit on My Journey and on the Guide's workspace, where it
            was the largest card on a screen that is meant to be about the
            person's next step. Two players competing for one page is not two
            chances to press play; it is a page that has lost its subject.

            So the split is by size. The right rail carries the small one in
            every room, for the track you already started; the choosing happens
            here, on the page that is already about media. Both drive the same
            audio — the provider sits in the root layout — so starting something
            here and walking back to a room keeps it playing.

            First on the page, above the toolkit, because this is the control
            somebody came to this screen to use. The toolkit is a shelf you read
            from occasionally; the player is the thing you press. */}
        <PlayerPanel
          vault={items}
          theme={theme}
          onAddMedia={() => fileRef.current?.click()}
        />

        {/* The starter toolkit — the same shelf for every account, Executive to
            anyone exploring. Real published resources, linked to the official free
            source. Beacon hosts none of them. */}
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">📖 Starter toolkit</h2>
          <p className="mb-3 text-sm text-gray-500">
            Free resources from the official publishers: the Bible, Ellen G.
            White, what the church teaches, and this quarter&rsquo;s Sabbath
            School. Open one, then use{' '}
            <span className="font-semibold">Upload files</span> below to keep a
            copy on this device for when you have no signal.
          </p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {['All', ...KIT_TOPICS].map((tp) => {
              const on = tp === topic;
              return (
                <button
                  key={tp}
                  onClick={() => setTopic(tp)}
                  className="compact-ui rounded-full px-3 py-1.5 text-sm font-semibold ring-1"
                  style={
                    on
                      ? { backgroundColor: NAVY, color: '#fff', borderColor: NAVY }
                      : { backgroundColor: '#fff', color: NAVY }
                  }
                >
                  {tp}
                </button>
              );
            })}
          </div>

          {/* TWO COLUMNS ONCE THERE IS ROOM FOR TWO. A list of forty short
              cards down a single column is forty screens of scrolling on a
              monitor that could show eight at a time. `items-start` so a card
              with a longer description does not stretch its neighbour. */}
          <div className="grid gap-2 lg:grid-cols-2 lg:items-start xl:gap-3">
            {STARTER_KIT.filter(
              (m) => topic === 'All' || m.topics.includes(topic),
            ).map((m) => {
              const url = safeExternalUrl(m.external_url);
              return (
                <div key={m.id} className="rounded-xl bg-gray-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl" aria-hidden>
                      {ICON[m.type] ?? ICON.link}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{m.title}</p>
                      <p className="text-sm text-gray-500">{m.description}</p>
                    </div>
                    {url && (
                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-navy underline"
                        >
                          Open
                        </a>
                        {/* Every one of these is a real public address from the
                            official publisher, so it can be passed straight to
                            someone who does not use Beacon at all. */}
                        <ShareButton
                          compact
                          payload={{ title: m.title, text: m.description, url }}
                          className="py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Add media */}
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">Add media</h2>
          <p className="mb-4 text-sm text-gray-500">
            Books (PDF), videos, music, images, anything. Files are saved on your
            device, not on any server. You can share them to Messenger, WhatsApp,
            Telegram, or another device.
          </p>

          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={onFiles}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="gold" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Saving…' : '⬆️ Upload files'}
            </Button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-500">…or add a link</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Title (e.g. Sabbath School video)"
                className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
              />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
              />
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A short note (optional)"
              className="tap mt-2 w-full rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
            />
            <div className="mt-2">
              <Button variant="ghost" onClick={addLink}>
                ➕ Add link
              </Button>
            </div>
          </div>
        </Card>

        {toast && (
          <p className="rounded-xl bg-navy px-4 py-3 text-center font-semibold text-white">
            {toast}
          </p>
        )}

        {/* My library */}
        {/* Playlists sit ABOVE the file list on purpose. Somebody who has
            already saved their music came here to play it, not to look at a
            list of filenames; somebody with an empty library sees the list's
            own empty state right below. */}
        {ready && items.some((m) => m.type === 'audio' || m.type === 'video') && (
          <div className="mb-4">
            <Playlists items={items} onRefresh={refresh} />
          </div>
        )}

        {!ready ? (
          <p className="text-center text-gray-400">Loading your library…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Your library is empty"
            hint="Upload a file or add a link to get started."
          />
        ) : (
          // The person's own saved media, same rule as the shelf above.
          <div className="grid gap-2 lg:grid-cols-2 lg:items-start xl:gap-3">
            {items.map((m) => {
              const url = safeExternalUrl(m.external_url);
              const playable =
                m.type === 'audio' ||
                m.type === 'video' ||
                m.type === 'image' ||
                (m.type === 'link' && !!videoEmbed(m.external_url));
              return (
                <Card key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="text-2xl" aria-hidden>
                    {ICON[m.type] ?? ICON.link}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{m.title}</p>
                    <p className="truncate text-sm text-gray-500">
                      {m.type === 'link' ? 'Link' : m.type.toUpperCase()}
                      {m.size ? ` · ${humanSize(m.size)}` : ''}
                      {m.type === 'video' && resolutionLabel(m.width, m.height)
                        ? ` · ${resolutionLabel(m.width, m.height)}`
                        : ''}
                      {m.note ? ` · ${m.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {playable && (
                      <Button
                        variant="ghost"
                        className="px-4 text-base"
                        onClick={() => setPlaying(playing === m.id ? null : m.id)}
                      >
                        {playing === m.id ? 'Close' : '▶ Play'}
                      </Button>
                    )}
                    <Button variant="gold" className="px-4 text-base" onClick={() => share(m)}>
                      Share
                    </Button>
                    {m.type === 'link' ? (
                      url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-navy underline"
                        >
                          Open
                        </a>
                      )
                    ) : (
                      <button
                        onClick={() => download(m)}
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-navy underline"
                      >
                        Download
                      </button>
                    )}
                    <button
                      onClick={() => remove(m)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-400 underline"
                    >
                      Delete
                    </button>
                  </div>
                  {playing === m.id && (
                    <div className="w-full basis-full">
                      <MediaPlayer item={m} theme={theme} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <p className="pb-8 text-center text-xs text-gray-400">
          Your files stay on this device. Beacon only helps you share them.
        </p>
      </main>
    </div>
  );
}
