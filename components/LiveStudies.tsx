'use client';

// Lesson studies a Guide writes, and an Explorer opens.
//
// WHAT WAS THERE BEFORE. A flat list of series titles and nothing else. No
// lessons inside them, no files, nothing to click. A Guide could not write one
// at all: the database policy on lesson_series was manages_church(church_id),
// so only a Director could, and the person actually sitting with somebody week
// by week could only look at a list.
//
// WHAT IT IS NOW. A Guide writes a series, adds studies to it, attaches the
// handouts they already use, and publishes it. Anybody in the church can open
// it and read the studies and the files. Directors keep the same power over
// everything, which is what manages_church still means.
//
// A DRAFT IS VISIBLE TO ITS AUTHOR ONLY, which sounds obvious and is the thing
// the old read policy got wrong: is_published alone meant a Guide could not see
// what they had just written until they published it, which makes writing it
// impossible.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { humanError } from '@/lib/live/errors';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';
import { useKeepUp, KEEP_UP_STUDIES } from '@/lib/live/keep-up';
import type { Role } from '@/lib/types';

/**
 * Who may write teaching material.
 *
 * Guides, Directors and Executive Directors. An Explorer reads every published
 * study in their church and everything their Guide shares, and writes none of
 * it -- the owner's decision, and the right shape: a study is something
 * prepared for somebody, and the person it is prepared for is not preparing it.
 *
 * THE SAME SENTENCE AS THE DATABASE. `public.may_write_studies()` in migration
 * `an_explorer_reads_the_studies` is the one that actually refuses. This exists
 * so nobody is shown a button that would be refused, and the two are checked
 * against each other by tests/an-explorer-reads-the-studies.mjs -- because two
 * copies of a rule are two things to change and one to forget.
 */
export function canWriteStudies(role: Role | undefined | null): boolean {
  return role === 'dm' || role === 'admin' || role === 'executive';
}

function message(cause: unknown): string {
  return humanError(cause, 'That did not work.');
}

function kb(bytes: number | null): string {
  if (!bytes) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One attached handout. The URL is signed when it is opened, never stored. */
function FileRow({ file, canRemove, onRemove }: {
  file: live.LessonFile; canRemove: boolean; onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const url = await live.lessonFileUrl(file.path);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          } finally { setBusy(false); }
        }}
        className="font-semibold text-blue-700 underline underline-offset-2"
      >
        📎 {file.name}
      </button>
      <span className="text-xs text-gray-400">{kb(file.size_bytes)}</span>
      {canRemove && (
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-700 underline">
          Remove
        </button>
      )}
    </li>
  );
}

/**
 * One series, opened.
 *
 * `mine` decides whether the writing controls appear. It is a convenience, not
 * a control: the database refuses a write from anybody else regardless of what
 * this component draws.
 */
function SeriesBody({ series, mine }: { series: live.LessonSeries; mine: boolean }) {
  const [lessons, setLessons] = useState<live.Lesson[] | null>(null);
  const [files, setFiles] = useState<Record<string, live.LessonFile[]>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Which study is open for editing, and the words as they are being changed.
  // One at a time on purpose: a phone has no room for two open editors, and
  // "which of these am I saving" is not a question worth creating.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { profile } = useLiveSession();

  const load = useCallback(async () => {
    try {
      const rows = await live.listLessons(series.id);
      setLessons(rows);
      setFiles(await live.listLessonFiles(rows.map((l) => l.id)));
      setError('');
    } catch (cause) { setLessons([]); setError(message(cause)); }
  }, [series.id]);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_STUDIES, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 border-t border-black/5 pt-3">
      {error && <p className="mb-2 rounded-xl bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {lessons !== null && lessons.length === 0 && (
        <p className="text-sm text-gray-400">
          {mine ? 'No studies in here yet. Add the first one below.' : 'Nothing in here yet.'}
        </p>
      )}

      <ol className="space-y-3">
        {lessons?.map((lesson, i) => (
          <li key={lesson.id} className="rounded-xl bg-white p-3 ring-1 ring-black/5">
            {editing === lesson.id ? (
              /* EDITING IN PLACE, NOT ON ANOTHER SCREEN. The handouts stay
                 visible underneath while the words are being changed, because
                 the study and the sheet that goes with it are one thing to the
                 person teaching from them. */
              <div className="grid gap-2">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title of this study"
                  className="rounded-xl border border-gray-300 px-3 py-2 font-semibold"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={5}
                  placeholder="Write the study here. Links become clickable."
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={busy || !editTitle.trim()}
                    onClick={() => act(async () => {
                      await live.updateLesson(lesson.id, { title: editTitle, body: editBody });
                      setEditing('');
                    })}
                  >
                    {busy ? 'Saving…' : 'Save changes'}
                  </Button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing('')}
                    className="text-sm font-semibold text-gray-600 underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold text-navy">{i + 1}. {lesson.title}</p>
                {lesson.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    <Linked text={lesson.body} />
                  </p>
                )}
              </>
            )}
            {(files[lesson.id] ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {files[lesson.id].map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    canRemove={f.added_by === profile?.id}
                    onRemove={() => void act(() => live.removeLessonFile(f.id))}
                  />
                ))}
              </ul>
            )}
            {mine && editing !== lesson.id && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {/* FIRST OF THE THREE, and deliberately not last. Delete was
                    the only way to change a study, so somebody wanting to fix
                    a typo had to reach for the destructive control. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(lesson.id);
                    setEditTitle(lesson.title);
                    setEditBody(lesson.body ?? '');
                  }}
                  className="text-xs font-semibold text-navy underline"
                >
                  Edit this study
                </button>
                <label className="cursor-pointer text-xs font-semibold text-navy underline">
                  Attach a file
                  <input
                    type="file"
                    // Same list as the conversation picker and the bucket.
                    // See lib/live/attachments.ts.
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    disabled={busy}
                    onChange={(event) => {
                      const input = event.target;
                      const file = input.files?.[0];
                      if (!file) return;
                      // The reset comes AFTER the upload. Clearing the input
                      // first aborts the read on WebKit, which fails silently
                      // and looks like a broken button on every iPhone.
                      void act(async () => {
                        try { await live.attachLessonFile(lesson.id, file); }
                        finally { input.value = ''; }
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => live.deleteLesson(lesson.id))}
                  className="text-xs font-semibold text-red-700 underline"
                >
                  Delete study
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {mine && (
        <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title of this study"
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Write the study here. Links become clickable."
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <div>
            <Button
              disabled={busy || !title.trim()}
              onClick={() => act(async () => {
                await live.addLesson(series.id, {
                  title, body, position: (lessons?.length ?? 0) + 1,
                });
                setTitle(''); setBody('');
              })}
            >
              {busy ? 'Saving…' : 'Add this study'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveStudies() {
  const { profile } = useLiveSession();
  // THE ROLE DECIDES, NOT THE CALLER. This was a `canWrite` prop each screen
  // passed by hand, and the four call sites had already drifted: the Guide's
  // own studies tab passed nothing, so a Guide -- somebody whose job is
  // preparing studies -- could not start one. Meanwhile a screen could pass
  // `canWrite` for an Explorer and hand them a form the database would refuse.
  //
  // One rule, read from the profile, matching `may_write_studies()` in the
  // database. A prop that four callers guess at is four chances to get a
  // permission wrong.
  const canWrite = canWriteStudies(profile?.role);
  const [rows, setRows] = useState<live.LessonSeries[] | null>(null);
  const [open, setOpen] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  // Which series is being renamed. Same one-at-a-time rule as the studies
  // inside them.
  const [renaming, setRenaming] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLessonSeries()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_STUDIES, load);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const byTopic = (rows ?? []).reduce<Record<string, live.LessonSeries[]>>((acc, s) => {
    (acc[s.topic || 'General'] ??= []).push(s); return acc;
  }, {});

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-blue-800/10 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-700 text-2xl shadow-sm">📖</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Lesson study</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">Read, reflect, and grow together.</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {canWrite
                ? 'Write your own studies, attach the handouts you already use, and publish them for your church.'
                : 'Open a series to read the studies in it and anything attached.'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      {canWrite && (
        <div className="mt-5 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New series title"
            className="tap rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Area of interest"
            className="tap rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
          />
          <Button
            disabled={busy || !title.trim()}
            onClick={() => act(async () => {
              const id = await live.addLessonSeries({ title, topic });
              setTitle(''); setTopic('');
              setOpen(id);
            })}
          >
            Create
          </Button>
        </div>
      )}

      {/* TIGHTER, ON PURPOSE. Each series was a padded box with a gap between
          its title and its own one-line description, so four studies filled a
          screen and the card read as four separate things rather than one list.
          A list of short items wants less air, not more: the grouping does the
          separating, and the padding only has to stop the text touching the
          edge. */}
      <div className="mt-6 space-y-4">
        {rows?.length === 0 && <p className="text-sm text-gray-400">No series yet.</p>}
        {Object.entries(byTopic).map(([t, list]) => (
          <div key={t}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-700">{t}</h3>
            <div className="mt-2 space-y-2">
              {list.map((s) => {
                // EVERYBODY MAY CHANGE A STUDY. NOBODY CHANGES IT FOR
                // ANYBODY ELSE.
                //
                // This asked "did I write it", which left the church's shared
                // studies editable by nobody. Widening it to Directors was the
                // first attempt and was wrong in the other direction: it made
                // one person's edit land on seventeen other shelves from a
                // button that looked like an ordinary edit.
                //
                // AN EXPLORER READS. THEY DO NOT WRITE.
                //
                // "For Explorers they cannot edit what the sample Lesson
                // studies are, only EDs, Directors and Guides can do that.
                // Explorers can only see all of the Lesson studies from the
                // sample and what the guide provided."
                //
                // This was briefly `true` for everybody, on an earlier
                // instruction that everybody should keep their own edited copy.
                // The owner narrowed it, and the narrower shape is the better
                // one: a study is teaching material, and the people who teach
                // are Guides, Directors and Executive Directors. Somebody being
                // walked with is not preparing the walk.
                //
                // The copy-on-first-edit machinery below stays and still
                // matters -- a Guide correcting a church sample gets their own
                // copy rather than rewriting it for the other forty Guides.
                // Only who may start that has changed.
                //
                // NOT THE BOUNDARY. `an_explorer_reads_the_studies` is what
                // actually refuses, and it refuses a request that never went
                // near a screen. This only stops offering a button that would
                // be refused, which is a courtesy, not a lock.
                const mine = canWriteStudies(profile?.role);
                // PUBLISHING IS THE EXCEPTION, and it is the one act here that
                // is genuinely church-wide: it puts a study on everybody's
                // shelf. Editing privately and publishing universally cannot
                // share a gate, so this one stays with whoever wrote it.
                const canPublish = !!profile && (
                  s.author_id === profile.id
                  || profile.role === 'admin'
                  || profile.role === 'executive'
                );
                const opened = open === s.id;
                return (
                  <div key={s.id} className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-navy/5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {/* THE WHOLE ROW OPENS IT. The complaint was that a
                          series could not be clicked at all. The chevron says
                          so without an underline, which on a list of four
                          titles reads as four links rather than four rows. */}
                      <button
                        type="button"
                        onClick={() => setOpen(opened ? '' : s.id)}
                        aria-expanded={opened}
                        className="flex flex-1 items-center gap-1.5 text-left font-semibold text-navy"
                      >
                        <span aria-hidden className="text-xs text-gray-400">
                          {opened ? '▾' : '▸'}
                        </span>
                        {s.title}
                      </button>
                      {!s.is_published && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          Draft, only you can see it
                        </span>
                      )}
                      {mine && (
                        <>
                          {/* Renaming a series was only possible by deleting it,
                              which took every study inside it with it. */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRenaming(renaming === s.id ? '' : s.id);
                              setNewTitle(s.title);
                              setNewTopic(s.topic || '');
                            }}
                            className="text-xs font-semibold text-navy underline"
                          >
                            Rename
                          </button>
                          {canPublish && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(() => live.setSeriesPublished(s.id, !s.is_published))}
                              className="text-xs font-semibold text-navy underline"
                            >
                              {s.is_published ? 'Unpublish' : 'Publish'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act(() => live.deleteLessonSeries(s.id))}
                            className="text-xs font-semibold text-red-700 underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                    {s.description && (
                      <p className="pl-[1.1rem] text-sm leading-snug text-gray-500">
                        <Linked text={s.description} />
                      </p>
                    )}
                    {renaming === s.id && (
                      <div className="mt-2 grid gap-2 rounded-xl bg-white p-3 ring-1 ring-navy/10 sm:grid-cols-[1fr_1fr_auto]">
                        <input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="Series title"
                          className="tap rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <input
                          value={newTopic}
                          onChange={(e) => setNewTopic(e.target.value)}
                          placeholder="Area of interest"
                          className="tap rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <div className="flex items-center gap-3">
                          <Button
                            disabled={busy || !newTitle.trim()}
                            onClick={() => act(async () => {
                              await live.updateLessonSeries(s.id, {
                                title: newTitle, topic: newTopic,
                              });
                              setRenaming('');
                            })}
                          >
                            {busy ? 'Saving…' : 'Save'}
                          </Button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRenaming('')}
                            className="text-sm font-semibold text-gray-600 underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {opened && <SeriesBody series={s} mine={mine} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}
