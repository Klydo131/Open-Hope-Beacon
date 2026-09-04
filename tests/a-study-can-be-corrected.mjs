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

// ---- Everybody may change a study, nobody changes it for anybody else ----
//
// TWO REPORTS AND TWO WRONG ANSWERS BEFORE THIS ONE.
//
// The screen asked "did I write it", so the church's shared studies were
// editable by nobody: author_id did not exist until migration 0038 and every
// series written before it carries NULL. Widening the gate to Directors fixed
// that and broke something worse -- one person's edit landed on seventeen other
// shelves, from a button that looked like an ordinary edit. The ask that
// settled it was "privately, based on their own account, not universal".
//
// So a shared study is a TEMPLATE. The first edit copies it to the person
// making it, and their edits land on their copy for ever after. Probed against
// the live policies, and rolled back:
//
//   guide:    make_copy=ALLOWED  original=untouched  lessons 6/6 still there
//   explorer: copy=ALLOWED  adds_lesson=ALLOWED  publish=refused
//             edits_shared=refused
{
  const data = read('lib/live/data.ts');
  const gate = ui.slice(ui.indexOf('const mine ='), ui.indexOf('const opened ='));
  ok(/const mine = true;/.test(gate),
     'the controls are drawn for everybody, because everybody may change their own copy');

  // PUBLISHING IS THE EXCEPTION and must not share the gate: it is the one act
  // on this screen that reaches the whole church.
  ok(/const canPublish = /.test(ui), 'publishing has its own narrower gate');
  ok(/\{canPublish && \(/.test(ui), 'and the Publish control asks it');
  ok(/author_id === profile\.id/.test(ui.slice(ui.indexOf('const canPublish ='))),
     'which starts from who wrote it');

  // The whole of "privately" is one function, so it is named and checked.
  const copy = data.slice(data.indexOf('export async function myVersionOf'));
  const body = copy.slice(0, copy.indexOf('\nexport '));
  ok(/if \(original\.author_id === me_id\) return original\.id;/.test(body),
     'a study you wrote is written in place, with no copy made');
  ok(/copied_from: original\.id/.test(body), 'and a shared one is copied to you');
  ok(/is_published: false/.test(body), 'the copy is private, which is the point');
  ok(/from\('lessons'\)[\s\S]{0,200}position/.test(body),
     'and the studies inside come with it, positions kept');

  // EVERY WRITE PATH GOES THROUGH IT. One that does not is a way to change the
  // church's copy by accident, which is the bug this replaced.
  // The OPENING PAREN is part of the search, because `addLesson` is a prefix of
  // `addLessonSeries` and `deleteLesson` of `deleteLessonSeries`, both of which
  // are declared earlier in the file. Without it this read the wrong function
  // and reported a fix missing that was three lines further down.
  for (const fn of ['updateLessonSeries', 'updateLesson', 'addLesson', 'deleteLesson']) {
    const f = data.slice(data.indexOf(`export async function ${fn}(`));
    ok(/myVersionOf/.test(f.slice(0, f.indexOf('\nexport '))),
       `${fn} writes to your version, not the shared one`);
  }

  // Deleting a shared study hides it for you rather than removing it from
  // everybody, which is not yours to do.
  const del = data.slice(data.indexOf('export async function deleteLessonSeries'));
  const delBody = del.slice(0, del.indexOf('\nexport '));
  ok(/author_id === me_id/.test(delBody) && /\.delete\(\)/.test(delBody),
     'your own study is really deleted');
  // THE INSERT SPECIFICALLY. `is_hidden: true` appears twice in this function,
  // once on the update branch for somebody who already has a copy, so matching
  // the bare string passed even with the insert's copy of it deleted.
  ok(/\.insert\(\{[\s\S]{0,400}copied_from: row\.id,[\s\S]{0,80}is_hidden: true/.test(delBody),
     'and a shared one is hidden for you alone, by a marker pointing at it');
  ok(!/\.delete\(\)[\s\S]{0,60}eq\('id', row\.id\)/.test(delBody),
     'and is never deleted out from under the rest of the church');

  // And the list has to honour both, or the shelf shows the same study twice.
  const list = data.slice(data.indexOf('export async function listLessonSeries'));
  const listBody = list.slice(0, list.indexOf('\nexport '));
  ok(/replaced\.has\(r\.id\)/.test(listBody), 'a template you have replaced is not shown as well');
  ok(/!r\.is_hidden/.test(listBody), 'and one you put away stays away');

  // The policy that lets an Explorer keep a copy, and stops them publishing it.
  const mig = read('supabase/migrations/20260904090000_a_study_is_yours_to_change.sql');
  ok(/author_id = \(select auth\.uid\(\)\)/.test(mig), 'a series may only be written as yourself');
  ok(/not is_published[\s\S]{0,120}manages_church/.test(mig),
     'and publishing to the church stays with the people who answer for it');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
