#!/usr/bin/env node
// Turn a Markdown document in docs/ into a printable PDF.
//
// ONE SOURCE, TWO OUTPUTS. The PDF people hand round at a demo and the document
// people read on GitHub are the same file. There is no separate PDF to fall out
// of date, because there is no separate PDF — this renders the Markdown that is
// already in the repository.
//
// Deliberately dependency-free. It uses the Chromium that Playwright already
// installs, through its own --print-to-pdf flag, so `node docs/handbook/build-pdf.js`
// works in a fresh clone with nothing but `npm install` behind it. A Markdown
// library and a PDF library would be two more things to keep current for a file
// that is generated a few times a year.
//
//   node docs/handbook/build-pdf.js                  # START-HERE.md
//   node docs/handbook/build-pdf.js SETUP.md SECURITY.md
//
// Output lands in docs/handbook/pdf/.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DOCS = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'pdf');

// ---------------------------------------------------------------------------
// Finding a browser
// ---------------------------------------------------------------------------
// Checked in order of how likely each is to be the one the reader has. The
// error at the end names every place that was looked in, because "browser not
// found" without a list is a message that cannot be acted on.
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  // Playwright's own download, whose directory carries a version number.
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const entry of fs.readdirSync(pwRoot)) {
      if (!entry.startsWith('chromium-')) continue;
      candidates.push(
        path.join(pwRoot, entry, 'chrome-linux', 'chrome'),
        path.join(pwRoot, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      );
    }
  } catch { /* no Playwright install; the plain paths above may still hit */ }

  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* next */ }
  }
  throw new Error(
    'No Chrome or Chromium found. Set CHROME_PATH to one, or run '
    + '`npx playwright install chromium`. Looked in:\n  ' + candidates.join('\n  '),
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
// Enough of the language for the documents in this repository: headings,
// tables, fenced code, blockquotes, lists, links, bold, italic and inline code.
// It is not a general Markdown implementation and does not pretend to be.
const escapeHtml = (text) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline formatting. Code spans are extracted FIRST and put back LAST, so that
// `**not bold**` inside backticks stays literal — otherwise every code sample
// containing an asterisk quietly changes meaning.
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    `<a href="${href}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`);
}

const slug = (text) => text.toLowerCase()
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

function render(markdown) {
  const lines = markdown.split('\n');
  const html = [];
  let i = 0;

  const closeList = (state) => { if (state.open) { html.push(`</${state.open}>`); state.open = null; } };
  const list = { open: null };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Taken verbatim — no inline processing inside.
    if (/^```/.test(line)) {
      closeList(list);
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Tables: a header row, a divider of dashes, then rows.
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      closeList(list);
      const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++]));
      html.push('<table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList(list);
      const level = heading[1].length;
      html.push(`<h${level} id="${slug(heading[2])}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList(list);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${render(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(line)) { closeList(list); html.push('<hr>'); i += 1; continue; }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (list.open !== want) { closeList(list); html.push(`<${want}>`); list.open = want; }
      html.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      i += 1;
      continue;
    }

    if (!line.trim()) { closeList(list); i += 1; continue; }

    closeList(list);
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^([#>|`-]|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    else i += 1;
  }
  closeList(list);
  return html.join('\n');
}

// Printed, not screen-read: serif body for long prose, page breaks kept out of
// the middle of headings and tables, and links shown in full because a PDF
// reader cannot hover over one.
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.55 Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  h1 { font-size: 24pt; margin: 0 0 4pt; color: #0b1f3a; page-break-after: avoid; }
  h2 { font-size: 15pt; margin: 20pt 0 6pt; color: #0b1f3a;
       border-bottom: 1.5pt solid #c9a227; padding-bottom: 3pt;
       page-break-after: avoid; page-break-before: auto; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; color: #0b1f3a; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 10pt 0 3pt; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { margin: 6pt 0 6pt 18pt; padding: 0; }
  li { margin: 2.5pt 0; }
  code { font: 9pt/1.4 'SF Mono', Menlo, Consolas, monospace;
         background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
  pre { background: #0b1f3a; color: #f8fafc; padding: 9pt 11pt; border-radius: 4pt;
        overflow-wrap: break-word; white-space: pre-wrap; page-break-inside: avoid;
        margin: 8pt 0; }
  pre code { background: none; color: inherit; padding: 0; font-size: 8.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt;
          page-break-inside: avoid; }
  th { background: #0b1f3a; color: #fff; text-align: left; padding: 5pt 7pt; }
  td { border-bottom: 0.5pt solid #d1d5db; padding: 5pt 7pt; vertical-align: top; }
  blockquote { margin: 9pt 0; padding: 7pt 12pt; background: #fdf8e8;
               border-left: 3pt solid #c9a227; page-break-inside: avoid; }
  blockquote p { margin: 0 0 4pt; }
  blockquote p:last-child { margin-bottom: 0; }
  hr { border: none; border-top: 0.5pt solid #d1d5db; margin: 14pt 0; }
  a { color: #0b1f3a; text-decoration: none; border-bottom: 0.5pt solid #9ca3af; }
  /* A printed link nobody can click needs to show where it goes — but only for
     real destinations, not for the in-page contents table. */
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 7.5pt; color: #6b7280;
                           border: none; word-break: break-all; }
  strong { color: #0b1f3a; }
</style></head><body>${body}</body></html>`;

const targets = process.argv.slice(2);
const files = targets.length ? targets : ['START-HERE.md'];
fs.mkdirSync(OUT, { recursive: true });
const chrome = findChrome();

for (const name of files) {
  const source = path.join(DOCS, name);
  if (!fs.existsSync(source)) {
    console.error(`skipped ${name} — not found in docs/`);
    process.exitCode = 1;
    continue;
  }
  const markdown = fs.readFileSync(source, 'utf8');
  const title = (markdown.match(/^#\s+(.*)$/m) || [, name])[1];
  const base = name.replace(/\.md$/, '');
  const htmlPath = path.join(OUT, `${base}.html`);
  const pdfPath = path.join(OUT, `Open-Hope-Beacon-${base}.pdf`);

  fs.writeFileSync(htmlPath, page(title, render(markdown)));
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ], { stdio: 'pipe' });
  fs.unlinkSync(htmlPath);

  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log(`${path.relative(process.cwd(), pdfPath)}  (${kb} KB)`);
}
