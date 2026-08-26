// A theme has to be readable, and it has to be applied.
//
// THE BUG THIS EXISTS FOR: choosing "Slate" made the whole left column vanish.
//
// The left navigation draws its labels in theme.ink and has NO surface of its
// own; it trusts the page behind it to be theme.bg. The live shell painted a
// hard-coded light grey instead and themed only the rails, so Slate's near-white
// ink landed on a near-white page. The right rail looked perfect throughout,
// because it paints theme.panel behind itself, which is exactly why this was
// reported as "themes are not working" rather than as one missing line.
//
// Two properties, and the first is the one nobody checks by eye across eleven
// themes on every surface.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// --- WCAG relative luminance and contrast ratio ----------------------------
function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// --- read the themes out of the source -------------------------------------
const src = readFileSync('lib/room-theme.ts', 'utf8');

// inkOn is lifted from the source and RUN, rather than reimplemented here. A
// second copy of the rule is a second thing to keep in step, and the day they
// disagree the test passes while the app is unreadable.
const inkOnSrc = src.slice(src.indexOf('export function inkOn'));
// eslint-disable-next-line no-new-func
const inkOn = new Function(
  `${inkOnSrc.slice(0, inkOnSrc.indexOf('\n}') + 2).replace('export function', 'function').replace(/: string/g, '').replace(/: number/g, '')}; return inkOn;`,
)();
const themes = [];
for (const block of src.split(/\{\s*\n\s*key:/).slice(1)) {
  const body = 'key:' + block.slice(0, block.indexOf('},'));
  const field = (name) => {
    const m = new RegExp(`${name}:\\s*'([^']*)'`).exec(body);
    return m ? m[1] : '';
  };
  const key = field('key');
  if (!key) continue;
  themes.push({
    key,
    label: field('label'),
    bg: field('bg'),
    panel: field('panel'),
    ink: field('ink'),
    inkSoft: field('inkSoft'),
    accent: field('accent'),
  });
}

ok(themes.length >= 8, `the themes were read from source (${themes.length} found)`);

/** Every hex colour in a value, so a gradient is checked at both ends. */
const stops = (value) => value.match(/#[0-9a-f]{3,8}\b/gi) ?? [];

// WCAG AA for normal body text is 4.5:1. The left rail's labels are small and
// semibold, which is exactly the case that needs the full ratio rather than
// the 3:1 allowed for large text.
const BODY = 4.5;
// Muted text and the accent chip are secondary, and holding them to 4.5 would
// mean no theme could have a soft grey at all. 3:1 is the AA floor for large
// text and for non-text contrast, and it is what keeps "muted" from becoming
// "absent".
const MUTED = 3;

for (const t of themes) {
  for (const stop of stops(t.bg)) {
    const r = contrast(t.ink, stop);
    ok(r >= BODY,
       `${t.key}: ink on its own page background is readable (${r.toFixed(1)}:1 at ${stop})`);
  }
  const onPanel = contrast(t.ink, t.panel);
  ok(onPanel >= BODY, `${t.key}: ink on its panel is readable (${onPanel.toFixed(1)}:1)`);

  const soft = contrast(t.inkSoft, t.panel);
  ok(soft >= MUTED, `${t.key}: muted text on its panel is still visible (${soft.toFixed(1)}:1)`);

  // THE SELECTED NAV ITEM sits on the accent. It used to be white always, and
  // four palettes have an accent light enough that white on it measures under
  // 3:1 -- Morning Light was 1.8:1, a label you cannot read on the page you
  // are currently on. inkOn picks black or white per accent, so what is
  // checked here is the colour that will actually be drawn.
  const chosen = inkOn(t.accent);
  const onAccent = contrast(chosen, t.accent);
  ok(onAccent >= BODY,
     `${t.key}: the selected page label is readable on its accent (${onAccent.toFixed(1)}:1, ${chosen})`);
}

// --- and the theme has to actually be painted -------------------------------
// The left rail has no surface of its own. If a shell does not paint the
// background, the rail's ink lands on whatever that shell hard-coded, which is
// the whole bug.
for (const shell of ['components/LiveAppShell.tsx', 'components/AppShell.tsx']) {
  const code = readFileSync(shell, 'utf8');
  ok(/background:\s*(room\.)?theme\.bg/.test(code),
     `${shell}: paints the theme background behind the rails`);
  ok(!/className="min-h-screen bg-\[#/.test(code),
     `${shell}: does not hard-code a page colour a theme cannot override`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
