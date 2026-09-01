// A document that is printed and handed to somebody has to render.
//
// THE BUG THIS EXISTS FOR. The PDF builder ran its inline pass over the FIRST
// LINE of a list item and no further, so a bold phrase that wrapped inside a
// bullet came out with its asterisks still in it:
//
//     ... and choose **Pause
//     project**.
//
// in print, in a document whose whole purpose is that somebody reads it and
// does what it says. Paragraphs had been joined before the inline pass for as
// long as the builder has existed; list items had not, and the handbook happens
// never to wrap a bold phrase inside a bullet, so nothing caught it. Two newer
// documents did, and both went out looking like that.
//
// This renders every document that gets printed and looks at the result, which
// is the only way to catch a class of bug that lives between the Markdown and
// the page.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The documents that are built into PDFs and handed to people.
const PRINTED = ['HANDBOOK.md', 'WHAT-IT-COSTS.md', 'DATA-PROTECTION.md', 'DO-THIS-NEXT.md'];

// The builder's own renderer, used rather than reimplemented: a second copy of
// the rules would drift from the first and then this would be checking a
// document nobody prints.
const source = readFileSync('docs/handbook/build-pdf.js', 'utf8');
const start = source.indexOf('function render(');
ok(start > -1, 'the builder has a render function to borrow');

const dir = mkdtempSync(path.join(tmpdir(), 'beacon-render-'));
const shim = path.join(dir, 'render.cjs');
const end = source.indexOf('\nconst page =');
readFileSync;
try {
  const body = source.slice(0, end);
  // The builder is a script; take everything above the part that goes looking
  // for a browser and export what is needed.
  const escaped = body.replace(/^#!.*\n/, '');
  const wrapper = `${escaped}\nmodule.exports = { render, inline, escapeHtml };\n`;
  const fs = await import('node:fs');
  fs.writeFileSync(shim, wrapper);

  const { render } = await import(`file://${shim}`).then((m) => m.default ?? m);

  for (const doc of PRINTED) {
    const file = path.join('docs', doc);
    if (!existsSync(file)) { ok(false, `${doc} is missing`); continue; }
    const html = render(readFileSync(file, 'utf8'));

    // 1. No Markdown left in the output. Asterisks, backticks and heading
    //    marks that survived the render are all the same failure.
    const leaked = (html.match(/\*\*/g) ?? []).length;
    ok(leaked === 0, `${doc}: no bold markers left in the page (${leaked})`);

    // 2. Tables come out balanced. A row with the wrong number of cells is a
    //    table that renders crooked, which nobody notices in Markdown.
    let crooked = 0;
    for (const table of html.match(/<table>[\s\S]*?<\/table>/g) ?? []) {
      const head = (table.match(/<th>/g) ?? []).length;
      for (const row of table.match(/<tr>(?!.*<th>)[\s\S]*?<\/tr>/g) ?? []) {
        const cells = (row.match(/<td>/g) ?? []).length;
        if (cells !== 0 && cells !== head) crooked += 1;
      }
    }
    ok(crooked === 0, `${doc}: every table row has as many cells as its heading`);

    // 3. It produced something. A renderer that returns nothing passes every
    //    check above.
    ok(html.length > 2000, `${doc}: rendered to a real page (${Math.round(html.length / 1024)} kB)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
