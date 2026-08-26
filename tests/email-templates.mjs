// The two rules that made an invitation arrive as a blank message.
//
// These templates are pasted into the Supabase dashboard rather than deployed,
// so nothing else in this repository ever executes them. That is exactly why
// they need a check: a mistake here is invisible until somebody reports an
// empty email, and the person who reports it is a stranger being invited to a
// church.
//
// RULE 1 — ONLY {{ .ConfirmationURL }}.
//
// A template that also used {{ .Email }} was delivered with nothing in the body
// at all. Go renders these, and a field it cannot resolve aborts the render
// rather than leaving a gap, so a blank message is the failure mode and no
// dashboard anywhere reports it. The link is the only thing the message needs.
//
// RULE 2 — NO HTML COMMENTS.
//
// Documentation lived at the top of both files and was pasted along with them.
// A comment in a pasted template is body content a client may or may not strip,
// and a {{ ... }} written inside one is still substituted, because Go templating
// has never heard of an HTML comment.

import { readFileSync, existsSync, readdirSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const DIR = 'docs/email-templates';

if (!existsSync(DIR)) {
  console.log('SKIP  no email templates in this checkout');
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.html'));
ok(files.length > 0, 'there are templates to check');

// TWO DIALECTS LIVE IN THIS FOLDER, AND MIXING THEM IS SILENT.
//
// Supabase Auth renders with Go templating and substitutes `.ConfirmationURL`.
// Brevo renders with its own engine and substitutes `params.JOIN_URL`, plus
// `{% if %}` blocks Go has never heard of.
//
// Paste one into the other's box and nothing announces the mistake: Supabase
// aborts the render and delivers an empty body, and Brevo leaves the unknown
// tag sitting in the message as literal text. Both look like a working save.
//
// So the filename decides which rules apply. `brevo-*` is Brevo's; everything
// else is Supabase's.
for (const file of files) {
  const html = readFileSync(`${DIR}/${file}`, 'utf8');
  const isBrevo = file.startsWith('brevo-');

  const vars = [...html.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
  ok(vars.length > 0, `${file}: substitutes something, so the link can appear`);
  ok(!/<!--/.test(html), `${file}: contains no HTML comment to be pasted into an inbox`);

  if (isBrevo) {
    const allowed = new Set([
      'params.JOIN_URL', 'params.FULL_NAME', 'params.CHURCH_NAME', 'params.ROLE',
    ]);
    const strays = [...new Set(vars.filter((v) => !allowed.has(v)))];
    ok(strays.length === 0,
       `${file}: uses only params the invite function sends${strays.length ? ` (found ${strays.join(', ')})` : ''}`);
    ok(vars.includes('params.JOIN_URL'), `${file}: carries the one-time link`);
    ok(!/\.ConfirmationURL/.test(html),
       `${file}: carries no Supabase tag, which Brevo would print as literal text`);
    const hrefs = (html.match(/href="\{\{\s*params\.JOIN_URL\s*\}\}"/g) || []).length;
    ok(hrefs >= 2, `${file}: the link appears as both a button and copyable text`);
  } else {
    const allowed = new Set(['.ConfirmationURL']);
    const strays = [...new Set(vars.filter((v) => !allowed.has(v)))];
    ok(strays.length === 0,
       `${file}: uses no variable beyond .ConfirmationURL${strays.length ? ` (found ${strays.join(', ')})` : ''}`);
    ok(vars.includes('.ConfirmationURL'), `${file}: carries the one-time link`);
    ok(!/\{%/.test(html),
       `${file}: carries no Brevo block, which Go templating cannot render at all`);
    const hrefs = (html.match(/href="\{\{\s*\.ConfirmationURL\s*\}\}"/g) || []).length;
    ok(hrefs >= 2, `${file}: the link appears as both a button and copyable text`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
