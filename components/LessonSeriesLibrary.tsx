'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Button, Card } from '@/components/ui';
import { LESSONS, lessonById, offerableSeries } from '@/lib/lessons';

// The library's series shelf.
//
// The client's words: "Can the library upload lesson series on specific areas of
// interest that can be pushed to seekers and walked through with them until they
// finish?" This is the first half — the building. A missionary does the pushing
// from a seeker's room, and the seeker does the walking on their own screen.
//
// Two decisions worth naming.
//
// A series is grouped by AREA OF INTEREST, not by journey stage. The stages are
// a note the church keeps about a person and a seeker never sees them; "Prayer"
// or "Understanding the Bible" is something somebody can say out loud about
// themselves. That is what makes a series safe to show a seeker the shape of.
//
// The order is the order you pick them in. There are no drag handles, no move-up
// arrows and no position numbers to keep in your head — you tap lessons in the
// order you want them walked, and the list underneath shows what you have built
// so far. An admin in their forties, on a phone, can do that on the first try.
export function LessonSeriesLibrary() {
  const { db, createSeries, setSeriesPublished } = useDemo();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [saved, setSaved] = useState('');

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const canSave = title.trim() && topic.trim() && picked.length > 0;

  const save = () => {
    if (!canSave) return;
    createSeries({ title, topic, description, lessonIds: picked });
    setSaved(title.trim());
    setTitle('');
    setTopic('');
    setDescription('');
    setPicked([]);
    setTimeout(() => setSaved(''), 5000);
  };

  const existing = [...db.lesson_series].sort(
    (a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title),
  );
  const published = offerableSeries(db.lesson_series).length;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">📚 Build a lesson series</h2>
        <p className="mb-4 text-sm text-gray-500">
          A course on one area of interest, walked through in order. Missionaries
          can start it for a seeker in one tap, and the seeker sees how far along
          they are the whole way.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Series name (e.g. Learning to pray)"
            aria-label="Series name"
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-4 text-base"
          />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Area of interest (e.g. Prayer)"
            aria-label="Area of interest"
            list="series-topics"
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-4 text-base"
          />
          {/* Existing topics offered, new ones still accepted. A church should
              be able to use its own words without being told they are wrong. */}
          <datalist id="series-topics">
            {Array.from(new Set(db.lesson_series.map((s) => s.topic))).map((tp) => (
              <option key={tp} value={tp} />
            ))}
          </datalist>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line about who this is for (optional)"
            aria-label="Description"
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-4 text-base sm:col-span-2"
          />
        </div>

        <p className="mb-2 mt-4 text-sm font-semibold text-navy">
          Tap lessons in the order you want them walked
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-gray-50 p-2">
          {LESSONS.map((l) => {
            const at = picked.indexOf(l.id);
            const on = at >= 0;
            return (
              <button
                key={l.id}
                onClick={() => toggle(l.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  on ? 'bg-navy text-white' : 'bg-white hover:bg-gray-100'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    on ? 'bg-gold text-navy' : 'bg-gray-100 text-gray-400'
                  }`}
                  style={on ? { backgroundColor: '#E8B84B', color: '#1E2A4A' } : undefined}
                >
                  {on ? at + 1 : '+'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{l.title}</span>
                  <span
                    className={`block truncate text-xs ${on ? 'text-white/70' : 'text-gray-400'}`}
                  >
                    {l.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="gold" disabled={!canSave} onClick={save}>
            Save series {picked.length > 0 ? `· ${picked.length} lessons` : ''}
          </Button>
          {picked.length > 0 && (
            <button
              onClick={() => setPicked([])}
              className="tap rounded-xl px-4 text-sm font-semibold text-gray-500"
            >
              Start over
            </button>
          )}
        </div>
        {saved && (
          <p className="mt-2 font-semibold text-green-600">
            ✓ &ldquo;{saved}&rdquo; is on the shelf. Missionaries can start it now.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">On the shelf</h2>
        <p className="mb-4 text-sm text-gray-500">
          {published} of {existing.length} available to missionaries. Taking one
          off the shelf stops it being offered; it never removes it from a seeker
          who has already started it.
        </p>
        {existing.length === 0 ? (
          <p className="text-gray-400">No series yet. Build the first one above.</p>
        ) : (
          <div className="space-y-2">
            {existing.map((s) => (
              <div key={s.id} className="rounded-xl bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-navy">{s.title}</p>
                    <p className="text-sm font-semibold" style={{ color: '#B08419' }}>
                      {s.topic} · {s.lesson_ids.length} lessons
                    </p>
                    {s.description && (
                      <p className="mt-1 text-sm text-gray-500">{s.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSeriesPublished(s.id, !s.is_published)}
                    className={`tap-sm shrink-0 rounded-xl px-4 text-sm font-semibold ${
                      s.is_published
                        ? 'bg-white text-navy ring-1 ring-navy/20'
                        : 'bg-navy text-white'
                    }`}
                  >
                    {s.is_published ? 'Take off the shelf' : 'Put on the shelf'}
                  </button>
                </div>
                <ol className="mt-3 space-y-1">
                  {s.lesson_ids.map((id, i) => {
                    const l = lessonById(id);
                    if (!l) return null;
                    return (
                      <li key={id} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-5 shrink-0 text-right font-bold text-gray-400">
                          {i + 1}
                        </span>
                        <span className="min-w-0 truncate">{l.title}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
