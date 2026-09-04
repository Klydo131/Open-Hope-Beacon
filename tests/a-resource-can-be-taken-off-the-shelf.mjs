// A resource you added can be taken off the shelf again.
//
// WHY THIS EXISTS. The church library could be added to and shared from, and
// never tidied. A link pasted with a typo, a resource that turned out to be the
// wrong one, a video the church decided against — all of it stayed for good,
// because the only control on a row was Share. The shelf could only ever grow.
//
// This is the same shape of gap as Lesson studies: `materials_drop` has
// permitted the delete the whole time — the person who added it, or anybody who
// manages the church — and only the app was missing. Nothing reports that kind
// of gap. There is no error and no refusal, just an absent button, which is why
// it is worth a test rather than a glance.
//
//   node tests/a-resource-can-be-taken-off-the-shelf.mjs
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
const ui = read('components/LiveLibrary.tsx');

// ---- The data layer ----
ok(/export async function deleteMaterial\s*\(/.test(data), 'lib/live/data.ts exports deleteMaterial');
ok(/from\('materials'\)\s*\.delete\(\)/.test(data), 'and it deletes from the materials table');

// ---- The screen offers it ----
ok(/live\.deleteMaterial\(/.test(ui), 'the library screen calls deleteMaterial');
ok(/Remove from library/.test(ui), 'and a row offers "Remove from library"');

// ---- It asks before it does it ----
// Removing cannot be undone, and the shelf is a dense list where the controls
// sit side by side. A single tap that destroys something is the wrong shape.
ok(/Yes, remove it/.test(ui), 'the first tap asks rather than removing');
ok(/Keep it/.test(ui), 'and there is a way to say no');
const askIndex = ui.indexOf('Remove from library');
const doIndex = ui.indexOf('Yes, remove it');
ok(askIndex !== -1 && doIndex !== -1 && doIndex < askIndex,
   'the confirmation is a separate control from the one that opens it');

// ---- Drawn as the discouraged thing it is ----
// tests/destructive-is-discouraged.mjs owns the general rule; this checks the
// specific row, because a red class is easy to lose in a refactor.
const removeProps = ui.slice(Math.max(0, ui.lastIndexOf('<button', askIndex)), askIndex);
ok(/text-red-\d{3}/.test(removeProps), 'the remove control is red');

// ---- And it is only drawn for somebody who may actually do it ----
ok(/const canManage = /.test(ui), 'the screen works out whether this person may act on one');
ok(/added_by === profile\.id/.test(ui), 'the person who added it may');
ok(/profile\.role === 'admin'/.test(ui) && /profile\.role === 'executive'/.test(ui),
   'and so may somebody who leads the church, matching materials_drop');

// The policy is the boundary, not the button. Say so in the source, so the next
// person does not mistake a hidden control for a permission check.
ok(/A convenience, not a control/.test(ui),
   'and the source says the database is what actually refuses');

// ---- And corrected, which it never could be ------------------------------
//
// `materials_edit` has been in the database since migration 0008 and NOTHING
// called it. The library could be added to and taken from and not corrected,
// so a typo in a link had one remedy: delete the entry and type it all again.
// That falls hardest on the church's starter links, which are the ones most
// likely to need fixing because nobody chose them for this congregation.
{
  const data = read('lib/live/data.ts');
  const fn = data.slice(data.indexOf('export async function updateMaterial'));
  // NOT `indexOf('\\n}')`. updateMaterial takes an object parameter whose
  // closing brace sits at the start of a line, so that finds the end of the
  // SIGNATURE and the body checked below would be empty and pass nothing.
  const body = fn.slice(0, fn.indexOf('\nexport ', 1));
  ok(body.length > 0, 'there is a way to correct a resource at all');
  ok(/\.from\('materials'\)[\s\S]{0,80}\.update\(/.test(body),
     'it updates the row rather than replacing it with a new one');
  ok(/http\?:/.test(body) || /https\?/.test(body),
     'and refuses an address with no scheme, the same as adding one does');

  // THE POLICY IT LEANS ON. Naming it here means a future change to the policy
  // has somewhere to be noticed.
  const policy = read('supabase/migrations/0008_library.sql');
  const edit = policy.slice(policy.indexOf('create policy materials_edit'));
  ok(/added_by = \(select auth\.uid\(\)\) or public\.manages_church\(church_id\)/
       .test(edit.slice(0, 260)),
     'and the policy behind it still allows the owner and whoever manages the church');
}

// ONE RULE FOR BOTH BUTTONS. The two policies are the same sentence, so a
// screen that gated Edit and Remove separately would drift from the database
// the first time one of them changed.
ok(/const canManage = /.test(ui), 'Edit and Remove are gated by one rule');
ok(!/const canRemove = /.test(ui), 'and not by two that can disagree');
ok((ui.match(/canManage\(m\)/g) || []).length >= 2, 'which both buttons ask');
ok(/startEdit\(m\)/.test(ui) && />\s*Edit\s*</.test(ui),
   'and the Edit control is on the row it corrects');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
