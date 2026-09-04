// A study you have written can be changed, not only deleted.
//
// WHY THIS EXISTS. Lesson studies could be created, published, unpublished and
// deleted — and never edited. A typo in a title, or a series filed under the
// wrong area of interest, could only be fixed by deleting the whole thing and
// writing it again, which also destroyed every handout attached to it, because
// the files hang off the lesson row. So in practice nobody fixed anything and
// the shelf carried the mistake.
//
// The database had allowed this all along: `lessons_edit` and `ls_edit` both
// permit an UPDATE from the author or from anybody who manages the church, and
// both pin church_id to the caller's own. Only the app was missing. That is
// worth a test precisely because nothing failed — no error, no refusal, just an
// absent button that nobody could point at.
//
//   node tests/a-study-can-be-corrected.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const data = read('lib/live/data.ts');
const ui = read('components/LiveStudies.tsx');

// ---- The data layer can change one, and refuses an empty title ----
for (const fn of ['updateLesson', 'updateLessonSeries']) {
  ok(new RegExp(`export async function ${fn}\\s*\\(`).test(data),
     `lib/live/data.ts exports ${fn}`);
}
ok(/from\('lessons'\)\.update\(/.test(data), 'updateLesson writes to the lessons table');
ok(/from\('lesson_series'\)\.update\(\{\s*\n?\s*title/.test(data),
   'updateLessonSeries writes the title back');

// A title is what the study is called in every list, so an empty one is not a
// correction, it is a study nobody can find again.
const guards = data.match(/needs a title/g) ?? [];
ok(guards.length >= 2, `both refuse an empty title (${guards.length})`);

// ---- The screen offers it, on the study and on the series ----
ok(/live\.updateLesson\(/.test(ui), 'the studies screen calls updateLesson');
ok(/live\.updateLessonSeries\(/.test(ui), 'and updateLessonSeries');
ok(/Edit this study/.test(ui), 'a study offers "Edit this study"');
ok(/>\s*Rename\s*</.test(ui), 'a series offers "Rename"');

// ---- Editing must be a way OUT, not a trap ----
ok((ui.match(/Cancel/g) ?? []).length >= 2,
   'both editors can be cancelled without saving');
ok(/setEditing\(''\)/.test(ui) && /setRenaming\(''\)/.test(ui),
   'and both close themselves once saved');

// ---- The destructive control must not be the only way to change something ----
// This is the shape of the original bug: Delete existed, Edit did not, so
// somebody fixing a typo had to reach for the button that destroys the work.
const lessonControls = ui.slice(ui.indexOf('Edit this study'), ui.indexOf('Delete study'));
ok(lessonControls.length > 0 && lessonControls.includes('Attach a file'),
   'Edit comes before Delete on a study, not after it');

// ---- The example studies, which had no edit and no delete ----------------
//
// REPORTED AS "the examples in Lesson studies have no edit or delete". The
// controls were there; the screen was stricter than the database.
//
// It asked only "did I write this". The policy has always been
// `manages_church(church_id) or author_id = auth.uid()`, and author_id did not
// exist until migration 0038 -- so every series written before it has
// author_id NULL. Four in this church do. The test was false for EVERYBODY on
// those rows, including the Director the policy allows, so Rename, Publish,
// Delete and the writing panel were hidden from the only person who could have
// used them.
//
// Probed against the live policies before the fix was written: a Director may
// edit and delete a series with a null author, and a Guide may not.
{
  const gate = ui.slice(ui.indexOf('const mine ='), ui.indexOf('const opened ='));
  ok(/author_id === profile\.id/.test(gate),
     'the person who wrote a series still gets its controls');
  ok(/profile\.role === 'admin'/.test(gate) && /profile\.role === 'executive'/.test(gate),
     'and so does somebody who manages the church, which is what the policy says');

  // The policy is the thing being mirrored, so read it rather than trust the
  // comment above the code.
  const policy = read('supabase/migrations/0038_a_guide_may_write_their_own_studies.sql');
  const edit = policy.slice(policy.indexOf('create policy ls_edit'));
  ok(/manages_church\(church_id\) or author_id = \(select auth\.uid\(\)\)/
       .test(edit.slice(0, 240)),
     'and the policy it mirrors is still the two-part one it was written against');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
