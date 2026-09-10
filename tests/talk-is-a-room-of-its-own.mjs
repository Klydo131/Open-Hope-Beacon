// The chat is a place you can go, and it took its safeguards with it.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Reported: the chat should not be a card people scroll a page
// to reach — "most users want always the present chat that doesn't need to
// scroll down for other features, specially for Explorers", and for Guides it
// is "their main connection to the Explorers".
//
// THE RISK IN MOVING A CONVERSATION. This app has one rule about the Explorer's
// conversation that outranks the layout: the way OUT of a relationship lives on
// the same screen as the relationship. components/live/ExplorerPage.tsx says so
// in the source — "must not be moved to another one". Giving the conversation
// its own room is exactly the change that could leave that control behind on
// the old page, and nothing would error: the new room would simply be a chat
// with no way to report the person in it.
//
//   node tests/talk-is-a-room-of-its-own.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. IT IS A ROOM, NOT ONLY A PANEL
// ---------------------------------------------------------------------------
{
  ok(exists('app/talk/page.tsx'), 'the chat has a route of its own at /talk');
  const page = read('app/talk/page.tsx');

  // A ROUTE IS WHAT MAKES BACK, RELOAD AND A NOTIFICATION LINK WORK. A panel
  // held only in memory has none of those and is the version people get lost in.
  ok(/allow=\{\['ds', 'dm'\]\}/.test(page),
     'and only the two roles who have a conversation may open it');
  ok(/onExit/.test(page) && /router\.back\(\)/.test(page),
     'it has a way out, and the way out is back to where you came from');
  ok(/Suspense/.test(page),
     'the search param is behind a boundary, so the route still builds');
}

// ---------------------------------------------------------------------------
// 2. THE SAFEGUARD TRAVELLED WITH IT
// ---------------------------------------------------------------------------
//
// The whole point of this file.
{
  const surface = read('components/live/TalkSurface.tsx');
  ok(/LiveReportControl/.test(surface),
     'the report control is in the chat room, not left behind on the old page');
  ok(/subjectId=\{current\.other_id\}/.test(surface),
     'and it reports the person you are actually talking to');

  // It must also still be where it was, because home keeps its conversation.
  const explorer = read('components/live/ExplorerPage.tsx');
  ok(/LiveReportControl/.test(explorer),
     'and it is still on the Explorer page, which also still has the thread');
}

// ---------------------------------------------------------------------------
// 3. THE COUNT CAN BE TRUSTED
// ---------------------------------------------------------------------------
//
// A badge that lies once is a badge nobody believes again.
{
  const surface = read('components/live/TalkSurface.tsx');
  ok(/markRead\(/.test(surface),
     'opening a conversation marks it read, so the count falls when it should');

  const data = read('lib/live/data.ts');
  ok(/rpc\('my_threads'\)/.test(data),
     'the count comes from the database in one call');
  ok(!/listMessages\([\s\S]{0,80}\)[\s\S]{0,200}filter\(\(m\)[\s\S]{0,80}read_at/.test(data),
     'and not by downloading every message to count them in the browser');

  const migration = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .find((f) => f.includes('talk_is_a_room'));
  ok(Boolean(migration), 'my_threads is created by a migration');
  if (migration) {
    const sql = read(`supabase/migrations/${migration}`);
    // ONLY THE CALLER'S OWN PAIRINGS. This function runs as its owner, so the
    // where-clause is the only thing standing there.
    ok(/p\.dm_id = me or p\.ds_id = me/.test(sql),
       'and it returns only pairings the caller is actually in');
    ok(/security definer/i.test(sql) && /stable/i.test(sql),
       'it is a definer function and does not pretend to write');
  }
}

// ---------------------------------------------------------------------------
// 4. THE DOCK KNOWS WHERE IT IS NOT WANTED
// ---------------------------------------------------------------------------
{
  const dock = read('components/live/TalkDock.tsx');

  // PHONE. A floating panel on a small screen covers the thing it floats over.
  ok(/hidden xl:block/.test(dock),
     'the docked panel is hidden below xl, so a phone gets the full screen instead');
  ok(/role !== 'ds' && profile\.role !== 'dm'/.test(dock),
     'it draws nothing for a Director, who has no conversation to be in');
  ok(/path === '\/talk'/.test(dock),
     'and nothing on the chat page itself, which would be a second copy of it');

  // NOTIFICATIONS: only on a rise, and never for the thread on screen.
  ok(/if \(before === null\) return now;/.test(dock),
     'the first look sets a baseline rather than announcing what was already there');
  ok(/is > was/.test(dock),
     'it announces a message arriving, not a count that merely exists');

  ok(/subscribeToMyMessages/.test(dock),
     'it watches every conversation, not only the one being read');
  const data = read('lib/live/data.ts');
  ok(/export function subscribeToMyMessages/.test(data),
     'and that subscription exists');
}

// ---------------------------------------------------------------------------
// 5. IT IS REACHABLE FROM EVERY ROOM
// ---------------------------------------------------------------------------
{
  const shell = read('components/LiveAppShell.tsx');
  ok(/href: '\/talk'/.test(shell), 'Talk is in the shell navigation');
  ok(/<TalkDock \/>/.test(shell),
     'and the dock is mounted once in the shell rather than per page');

  const idx = shell.indexOf("href: '/talk'");
  const church = shell.indexOf("href: '/church'");
  ok(idx !== -1 && church !== -1 && idx < church,
     'and it comes first, because for an Explorer it is most of why they are here');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
