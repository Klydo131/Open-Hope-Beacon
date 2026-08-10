// Do the tests run anywhere, or only on the machine that wrote them?
//
// Three separate portability bugs were committed into these suites before this
// check existed, and none of them failed loudly:
//
//   • `require('/opt/node22/lib/node_modules/playwright')` — an absolute path
//     to one sandbox, in a committed test.
//   • `const OUT = '/tmp/claude-0/-home-user/<session-id>/scratchpad'` — six
//     files writing screenshots into a directory that exists for one session.
//   • `const BASE = 'http://localhost:4002'` — a hardcoded port, so running the
//     suite against a server anywhere else failed with a connection error that
//     reads exactly like a broken app rather than a broken test.
//
// That last one wasted real time twice: the failure looks like the product is
// down. A test that cannot run on a second machine is not a safety net, it is a
// decoration, and CI is the second machine.
//
// This is a lint, not a test run — it never starts a browser, so it costs
// nothing and can gate every push.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (m) => console.log(`OK   ${m}`);
const fail = (m) => {
  bad++;
  console.log(`FAIL ${m}`);
};

const e2eDir = path.join(root, 'tests/e2e');
if (!fs.existsSync(e2eDir)) {
  console.log('OK   no e2e directory in this repo');
  process.exit(0);
}

const suites = fs
  .readdirSync(e2eDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'));

const problems = {
  'an absolute path into node_modules': /require\(\s*['"]\/[^'"]*node_modules[^'"]*['"]\s*\)/,
  'a session-specific scratchpad path': /['"]\/tmp\/claude-[^'"]*['"]/,
  'a hardcoded browser executable': /['"]\/opt\/pw-browsers\/[^'"]*['"]/,
  'a hardcoded home directory': /['"]\/home\/[a-z]+\/[^'"]*['"]/,
};

for (const [label, pattern] of Object.entries(problems)) {
  const hits = suites.filter((f) =>
    pattern.test(fs.readFileSync(path.join(e2eDir, f), 'utf8')),
  );
  hits.length
    ? fail(`${label} in: ${hits.join(', ')}`)
    : ok(`no suite carries ${label}`);
}

// A hardcoded port is only a problem when nothing can override it. Suites are
// run as `node tests/e2e/<suite>.js <port>`, so the port must come from argv
// with the literal as a fallback at most.
const portOffenders = suites.filter((f) => {
  const src = fs.readFileSync(path.join(e2eDir, f), 'utf8');
  const usesLiteralPort = /(localhost|127\.0\.0\.1):\d+/.test(src);
  if (!usesLiteralPort) return false;
  return !/process\.argv\[2\]/.test(src);
});
portOffenders.length
  ? fail(
      `suites with a hardcoded port and no argv override: ${portOffenders.join(', ')} ` +
        '— they will fail against any other server and it looks like an outage',
    )
  : ok('every suite takes its port from the command line');

// Every suite must exit non-zero when it fails, or the runner reports a pass.
// This is the failure mode that makes a whole suite decorative.
const silent = suites.filter((f) => {
  const src = fs.readFileSync(path.join(e2eDir, f), 'utf8');
  return !/process\.exit\(/.test(src);
});
silent.length
  ? fail(`suites that never call process.exit: ${silent.join(', ')} — a failure would report as a pass`)
  : ok(`all ${suites.length} suites signal failure through their exit code`);

console.log(
  bad === 0
    ? '\nRESULT: the suites run anywhere ✓'
    : `\nRESULT: ${bad} PORTABILITY PROBLEM(S)`,
);
process.exit(bad ? 1 : 0);
