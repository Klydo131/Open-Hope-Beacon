// The words a member reads, checked for the tells that make copy sound written
// by a machine.
//
// WHY A TEST AND NOT A STYLE NOTE.
//
// The owner asked twice for the em dashes to go. They went, and then they came
// back, because every new screen is written by someone (or something) reaching
// for the same punctuation, and nobody re-greps 22 files before a commit. A
// convention that is only written down is a convention that decays. This one
// fails the build instead.
//
// WHAT IT LOOKS AT. Text that can reach a screen: string literals and JSX
// prose, with comments stripped first. Code comments are internal and may say
// whatever they need to; a reader of the app never sees them. That distinction
// is the whole reason this scanner exists rather than a plain `grep -r`.
//
// THE SCANNER STRIPS COMMENTS THE CRUDE WAY, and knows it. A `//` inside a
// string on a line with an odd number of quotes before it is left alone; block
// comments are tracked across lines. It has caught its own prose twice in this
// repository, which is exactly the false positive it is built to avoid.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const ROOTS = ['app', 'components', 'lib', 'supabase/functions'];
const files = execSync(
  `find ${ROOTS.join(' ')} \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/node_modules/*' | sort`,
).toString().trim().split('\n').filter(Boolean);

ok(files.length > 50, `there is a tree to read (${files.length} files)`);

/** Every line of `file` that can reach a screen, with comments blanked out. */
function displayLines(file) {
  const out = [];
  let inBlock = false;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    let l = line;
    if (inBlock) {
      if (!l.includes('*/')) return;
      inBlock = false;
      l = l.slice(l.indexOf('*/') + 2);
    }
    if (/^\s*\/\//.test(l)) return;
    if (/^\s*\{?\/\*/.test(l)) { if (!l.includes('*/')) inBlock = true; return; }
    if (l.includes('/*')) { inBlock = !l.includes('*/'); l = l.slice(0, l.indexOf('/*')); }
    // A trailing // comment, but only when the quotes before it balance.
    const at = l.indexOf('//');
    if (at !== -1) {
      const before = l.slice(0, at);
      const quotes = (before.match(/['"`]/g) || []).length;
      if (quotes % 2 === 0) l = before;
    }
    out.push({ n: i + 1, text: l, raw: line });
  });
  return out;
}

const report = (hits, limit = 12) => {
  hits.slice(0, limit).forEach((h) => console.log(`        ${h}`));
  if (hits.length > limit) console.log(`        ...and ${hits.length - limit} more`);
};

// ---------------------------------------------------------------------------
// 1. No em dash or en dash in anything a member reads.
// ---------------------------------------------------------------------------
// The em dash is the single loudest tell, and it is also genuinely worse for
// the reader here: a Sabbath-school member on a phone reads a full stop faster
// than a clause hung off a dash. Every one of them has a plain replacement -- a
// full stop, a comma, a colon, or a rewritten sentence.
{
  const hits = [];
  for (const f of files) {
    for (const { n, raw, text } of displayLines(f)) {
      if (/[—–]/.test(text)) hits.push(`${f}:${n}  ${raw.trim().slice(0, 100)}`);
    }
  }
  ok(hits.length === 0, `no em dash or en dash in display text (${hits.length} found)`);
  report(hits);
}

// ---------------------------------------------------------------------------
// 2. Nobody is called a "missionary" any more.
// ---------------------------------------------------------------------------
// The role was renamed to Guide. The word survived in the tutorial and the
// demo seed for months, so the same person had two different names depending
// on which door you came in by, and the guided walk taught the wrong one.
{
  // ONE FILE HAS TO SAY THE OLD WORD. A release note announcing the rename
  // cannot announce it without naming what was renamed, and a member who
  // remembers the old word is exactly who that note is for.
  const CHANGELOG = 'lib/release-notes.ts';

  const hits = [];
  for (const f of files) {
    if (f === CHANGELOG) continue;
    for (const { n, raw, text } of displayLines(f)) {
      // `t('missionary')` is an i18n KEY, and it resolves to ROLE_LABELS.dm.
      // Renaming keys is a separate change with its own risk; what matters
      // here is the word a person reads, and that one already says Guide.
      const stripped = text.replace(/t\(\s*'missionary'\s*\)/g, '');
      if (/missionar/i.test(stripped)) hits.push(`${f}:${n}  ${raw.trim().slice(0, 100)}`);
    }
  }
  ok(hits.length === 0, `no member is called a "missionary" (${hits.length} found)`);
  report(hits);
}

// ---------------------------------------------------------------------------
// 3. The cadences that read as machine-written.
// ---------------------------------------------------------------------------
// These are shapes, not words. The antithesis flip ("X is not Y. Y is X."), the
// self-satisfied "on purpose", the aphorism landing at the end of a paragraph.
// Any one of them can be the right sentence. Several on one screen is what
// people mean when they say copy sounds generated, and this app asks strangers
// to trust it with a private conversation -- sounding synthetic is a real cost.
//
// Deliberately narrow. A checker that flags honest prose gets switched off.
{
  const PATTERNS = [
    [/\bis not (a|an|the)\b[^.]{0,60}\.\s*(It|That|This) is\b/i, 'antithesis flip'],
    [/\bon purpose\b/i, '"on purpose"'],
    [/\bwhich is exactly\b/i, '"which is exactly"'],
    [/\bthat is not [a-z]+ing\b/i, '"that is not <verb>ing"'],
    [/\bis a real [a-z]+ and not a\b/i, '"a real X and not a Y"'],
    [/\bnot .{2,40} but rather\b/i, '"not X but rather"'],
  ];
  const hits = [];
  for (const f of files) {
    for (const { n, raw, text } of displayLines(f)) {
      for (const [re, name] of PATTERNS) {
        if (re.test(text)) { hits.push(`${f}:${n}  [${name}] ${raw.trim().slice(0, 90)}`); break; }
      }
    }
  }
  ok(hits.length === 0, `no machine-sounding cadence in display text (${hits.length} found)`);
  report(hits);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
