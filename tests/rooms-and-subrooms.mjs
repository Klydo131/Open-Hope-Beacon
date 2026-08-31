// A room with subrooms, and every panel inside exactly one of them.
//
// THE REPORT, with a drawing: rooms are main folders and subrooms are folders
// inside them. "I want the Office room to have subrooms for the user not to
// scroll down to look for their tool equipment... If I pick the Lesson studies
// subroom, I will automatically go there and create my own Lesson studies, not
// scroll down and find it."
//
// The Office was nine panels stacked down one page. A Guide who came here to
// write a study walked past their numbers, the shelf, two pairing cards and a
// recommendation form to reach it, every time.
//
// WHAT CAN GO WRONG LATER, and what this file is for:
//
//   1. Somebody adds a panel and drops it in unguarded. It then draws in every
//      subroom, and the room is a scroll again with tabs painted on top.
//   2. Somebody puts a panel in two subrooms. It is then in neither, as far as
//      the person hunting for it is concerned.
//   3. A link points at `?room=` an id that does not exist. The subroom falls
//      back to the first one and the person is somewhere they did not ask for,
//      which is the original complaint restated.
//
// The browser walk in `tests/e2e/office-subrooms.js` proves the tapping. This
// proves the shape, because the live Office needs a database session the
// sandbox cannot hold and only the sample half can be rendered here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const office = readFileSync('app/office/page.tsx', 'utf8');
const clean = stripComments(office);

// ---------------------------------------------------------------------------
// 1. The Office uses the mechanism the Director's screen already had.
// ---------------------------------------------------------------------------
{
  ok(/from '@\/components\/Rooms'/.test(clean), 'the Office imports the shared Rooms mechanism');
  ok(/useRoom\(rooms,/.test(clean), 'and asks it which subroom is open');
  ok(/<RoomTabs\s/.test(clean), 'and draws the strip of choices');
  ok(/beacon:office-room:\$\{profile\?\.role/.test(clean),
     'the remembered subroom is per role, so a Guide and a Director keep their own place');
}

// ---------------------------------------------------------------------------
// 2. Every panel is inside exactly one subroom.
// ---------------------------------------------------------------------------
// Brace-tracked rather than matched by regex: a `{room === 'x' && ...}` block
// contains arrow functions and nested JSX, and anything that stops at the first
// `}` reports whatever it likes.
function panelsByRoom(source, fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) return null;
  // Brace-match the function's own body. Slicing to the next `function` keyword
  // ran DemoOffice's body to the end of the file and swept up the shells in
  // OfficePage, which are not panels and are not in a subroom — a failure that
  // was entirely this reader's, and exactly the reason to bound it properly.
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0, end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) { end = i + 1; break; } }
  }
  const body = source.slice(start, end);
  const found = [];
  const stack = [];      // { id, depth } for each open `{room === 'id' &&`
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      const m = /^\{\s*room === '([a-z]+)'/.exec(body.slice(i, i + 40));
      depth += 1;
      if (m) stack.push({ id: m[1], depth });
      continue;
    }
    if (ch === '}') {
      while (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth -= 1;
      continue;
    }
    const tag = /^<(Live[A-Za-z]+|Analytics|LessonSeriesLibrary)[\s/>]/.exec(body.slice(i, i + 40));
    if (tag) found.push({ panel: tag[1], room: stack.length ? stack[stack.length - 1].id : null });
  }
  return found;
}

{
  const panels = panelsByRoom(clean, 'LiveOffice');
  ok(Array.isArray(panels) && panels.length > 0,
     `the live Office draws panels (${panels ? panels.length : 0})`);

  const loose = panels.filter((p) => p.room === null).map((p) => p.panel);
  ok(loose.length === 0,
     loose.length
       ? `these draw in every subroom because nothing guards them: ${[...new Set(loose)].join(', ')}`
       : 'every panel in the Office is inside a subroom');

  const rooms = new Map();
  for (const p of panels) {
    if (!p.room) continue;
    (rooms.get(p.panel) ?? rooms.set(p.panel, new Set()).get(p.panel)).add(p.room);
  }
  const twice = [...rooms].filter(([, set]) => set.size > 1)
    .map(([panel, set]) => `${panel} (${[...set].join(', ')})`);
  ok(twice.length === 0,
     twice.length
       ? `these are in more than one subroom, so nobody knows where to look: ${twice.join('; ')}`
       : 'and no panel is in two subrooms at once');

  // THE ONE THE OWNER NAMED. Picking Lesson studies has to land on the writing
  // desk, not somewhere near it.
  ok(rooms.get('LiveStudies') && [...rooms.get('LiveStudies')][0] === 'studies',
     'Lesson studies is its own subroom');

  // NOTHING WAS LOST ON THE WAY IN. Splitting one page into subrooms is a lot
  // of moving, and a panel that is imported and never drawn is a tool that has
  // quietly disappeared from somebody's Office. TypeScript will not say a word
  // about it.
  const imported = [...clean.matchAll(/import \{([^}]+)\} from '@\/components\/[^']+'/g)]
    .flatMap((m) => m[1].split(',').map((n) => n.trim()))
    .filter((n) => /^(Live[A-Z]|Analytics$|LessonSeriesLibrary$)/.test(n))
    .filter((n) => !['LiveAppShell'].includes(n));
  const drawn = new Set([...panels, ...(panelsByRoom(clean, 'DemoOffice') ?? [])].map((x) => x.panel));
  const orphaned = imported.filter((n) => !drawn.has(n));
  ok(orphaned.length === 0,
     orphaned.length
       ? `these are imported into the Office and drawn nowhere: ${orphaned.join(', ')}`
       : `every tool the Office imports is still in one of its subrooms (${imported.length})`);
}

// ---------------------------------------------------------------------------
// 3. A Guide lands on the writing desk.
// ---------------------------------------------------------------------------
// `useRoom` opens the first subroom when there is nothing remembered, so the
// order of the list is a decision about what the room is for.
{
  // THE FIRST ENTRY, not "somewhere in the first two hundred characters".
  // The looser version passed happily with the list reordered, which is the
  // only change it existed to catch.
  const listStart = clean.indexOf('const rooms: Room[] = ');
  const splitAt = clean.indexOf(': [', listStart);
  const firstOf = (chunk) => /\{ id: '([a-z]+)'/.exec(chunk)?.[1] ?? '(none)';

  const guideFirst = firstOf(clean.slice(listStart, splitAt));
  ok(guideFirst === 'studies',
     `a Guide's first subroom is Lesson studies, which is what they open the room to do (${guideFirst})`);

  const leadFirst = firstOf(clean.slice(splitAt, clean.indexOf('const [room')));
  ok(leadFirst === 'numbers',
     `and leadership's first subroom is the numbers, which is what they open it for (${leadFirst})`);
}

// ---------------------------------------------------------------------------
// 4. The demo Office has the same shape.
// ---------------------------------------------------------------------------
// Somebody learns the job on the sample side and then signs in. A tutorial that
// teaches one long page and a live app with subrooms teaches the shape wrong.
{
  const demo = panelsByRoom(clean, 'DemoOffice');
  ok(demo && demo.length > 0, 'the sample Office draws panels too');
  ok(demo && demo.every((p) => p.room !== null),
     'and every one of them is inside a subroom as well');
  ok(/useRoom\(rooms, 'beacon:office-room:demo'\)/.test(clean),
     'with its own remembered choice, so practising does not move the live one');
}

// ---------------------------------------------------------------------------
// 5. Every link into a subroom names one that exists.
// ---------------------------------------------------------------------------
{
  const ids = new Set([...clean.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]));
  ok(ids.size >= 5, `the Office defines subrooms (${[...ids].join(', ')})`);

  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full.split(path.sep).join('/')] : [];
  });

  const broken = [];
  for (const file of [...walk('components'), ...walk('app'), ...walk('lib')]) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/\/office\?room=([a-z]+)/g)) {
      if (!ids.has(m[1])) broken.push(`${file}: ?room=${m[1]}`);
    }
    // A hash into the Office points at a card that a subroom may not be
    // drawing. The Office translates the ones that existed; a new one would
    // land on a page with nothing to scroll to.
    for (const m of src.matchAll(/\/office#([a-z-]+)/g)) {
      if (!clean.includes(`'${m[1]}':`)) broken.push(`${file}: #${m[1]} is not translated to a subroom`);
    }
  }
  ok(broken.length === 0,
     broken.length
       ? `these links point into the Office at something that is not there:\n        ${broken.join('\n        ')}`
       : 'every link into an Office subroom names a subroom that exists');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
